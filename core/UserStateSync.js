import StorageManager from './StorageManager.js';
import { getApiVersion, getApiBasePath, getAuthHeaders } from './ConfigLoader.js';

const SNAPSHOT_META_KEY = '__dbSnapshotMeta';

class UserStateSync {
    constructor() {
        this.enabled = false;
        this.isApplyingRemoteSnapshot = false;
        this.flushTimer = null;
    }

    async initializeForLoggedInUser() {
        if (getApiVersion() < 2) return false;

        const user = await this.fetchCurrentUser();
        if (!user || user.is_anonymous) {
            this.disable();
            return false;
        }

        this.enabled = true;
        StorageManager.setRemoteSyncAdapter(this);

        // Hydrate local scoped storage from DB snapshot before state managers read it.
        await this.pullRemoteSnapshot();

        // Ensure the database has an up-to-date snapshot soon after login.
        this.scheduleSync(500);
        return true;
    }

    disable() {
        this.enabled = false;
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        StorageManager.setRemoteSyncAdapter(null);
    }

    scheduleSync(delayMs = 1500) {
        if (!this.enabled || this.isApplyingRemoteSnapshot) return;

        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
        }

        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            this.pushSnapshot().catch((error) => {
                console.warn('[UserStateSync] Snapshot sync failed:', error?.message || error);
            });
        }, delayMs);
    }

    exportSnapshot() {
        const data = {};
        for (const key of StorageManager.keys()) {
            if (key === SNAPSHOT_META_KEY) continue;
            data[key] = StorageManager.get(key);
        }

        return {
            version: 1,
            exported_at: new Date().toISOString(),
            storage: data,
        };
    }

    async pushSnapshot() {
        if (!this.enabled || this.isApplyingRemoteSnapshot) return;

        const snapshot = this.exportSnapshot();
        const response = await fetch(this.apiUrl('user-state'), {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders(),
            },
            body: JSON.stringify({ snapshot }),
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(payload.error || `Snapshot save failed (${response.status})`);
        }
        this.saveMeta({
            updated_at: payload.updated_at || new Date().toISOString(),
        });
    }

    async pullRemoteSnapshot() {
        const response = await fetch(this.apiUrl('user-state'), {
            headers: {
                'Accept': 'application/json',
                ...getAuthHeaders(),
            },
        });

        if (!response.ok) {
            return;
        }

        const data = await response.json().catch(() => null);
        if (!data) return;
        const snapshot = data.snapshot;
        const storageData = snapshot?.storage;
        const remoteUpdatedAt = this.toMillis(data.updated_at);

        if (!storageData || typeof storageData !== 'object' || Array.isArray(storageData)) {
            return;
        }

        const localMeta = this.loadMeta();
        const localUpdatedAt = this.toMillis(localMeta.updated_at);
        const hasLocalScopedData = StorageManager.keys().some(key => key !== SNAPSHOT_META_KEY);

        // Preserve local state if it appears newer than the remote snapshot.
        if (hasLocalScopedData && localUpdatedAt && remoteUpdatedAt && localUpdatedAt > remoteUpdatedAt) {
            this.scheduleSync(500);
            return;
        }

        this.isApplyingRemoteSnapshot = true;
        try {
            StorageManager.clear();
            for (const [key, value] of Object.entries(storageData)) {
                StorageManager.set(key, value);
            }
            this.saveMeta({ updated_at: data.updated_at || new Date().toISOString() });
        } finally {
            this.isApplyingRemoteSnapshot = false;
        }
    }

    loadMeta() {
        const meta = StorageManager.get(SNAPSHOT_META_KEY, {});
        if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
            return {};
        }
        return meta;
    }

    saveMeta(meta) {
        StorageManager.set(SNAPSHOT_META_KEY, {
            ...(this.loadMeta() || {}),
            ...(meta || {}),
        });
    }

    toMillis(value) {
        if (!value || typeof value !== 'string') return 0;
        const ts = Date.parse(value);
        return Number.isFinite(ts) ? ts : 0;
    }

    apiUrl(path) {
        const basePath = getApiBasePath();
        return `${basePath}api/v2/${path}`;
    }

    async fetchCurrentUser() {
        try {
            const response = await fetch(this.apiUrl('auth/me'), {
                headers: {
                    'Accept': 'application/json',
                    ...getAuthHeaders(),
                },
            });

            if (!response.ok) return null;
            const data = await response.json();
            return data.user || null;
        } catch {
            return null;
        }
    }
}

const userStateSync = new UserStateSync();
export default userStateSync;
