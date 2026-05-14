<?php
/**
 * Router - Lightweight REST router for the v2 API.
 *
 * Supports:
 *   - GET / POST / PUT / DELETE / PATCH method registration
 *   - Path parameters via :name syntax (e.g. /users/:id)
 *   - Middleware via use()
 *   - 404 / 405 responses
 *
 * Path params are passed to controller methods as an associative array:
 *   $router->get('/users/:id', [UserController::class, 'get']);
 *   // Calls (new UserController())->get(['id' => '42'])
 */
class Router
{
    /** @var array<string, array<int, array{pattern: string, regex: string, params: array, handler: array|callable}>> */
    private array $routes = [
        'GET'    => [],
        'POST'   => [],
        'PUT'    => [],
        'PATCH'  => [],
        'DELETE' => [],
    ];

    /** @var callable[] */
    private array $middleware = [];

    public function get(string $path, $handler): self
    {
        return $this->addRoute('GET', $path, $handler);
    }

    public function post(string $path, $handler): self
    {
        return $this->addRoute('POST', $path, $handler);
    }

    public function put(string $path, $handler): self
    {
        return $this->addRoute('PUT', $path, $handler);
    }

    public function patch(string $path, $handler): self
    {
        return $this->addRoute('PATCH', $path, $handler);
    }

    public function delete(string $path, $handler): self
    {
        return $this->addRoute('DELETE', $path, $handler);
    }

    /**
     * Register a middleware that runs before each route's handler.
     */
    public function use(callable $middleware): self
    {
        $this->middleware[] = $middleware;
        return $this;
    }

    /**
     * Dispatch a request. Calls jsonError on 404/405.
     */
    public function dispatch(string $method, string $path): void
    {
        $method = strtoupper($method);
        $path = '/' . trim($path, '/');
        if ($path === '/') {
            $path = '/';
        }

        // Find matching route
        $matchedRoute = null;
        $matchedParams = [];
        $methodsForPath = [];

        foreach ($this->routes as $routeMethod => $routes) {
            foreach ($routes as $route) {
                if (preg_match($route['regex'], $path, $matches)) {
                    if ($routeMethod === $method) {
                        $matchedRoute = $route;
                        // Build associative param array
                        foreach ($route['params'] as $idx => $name) {
                            $matchedParams[$name] = $matches[$idx + 1] ?? null;
                        }
                        break 2;
                    } else {
                        $methodsForPath[] = $routeMethod;
                    }
                }
            }
        }

        if ($matchedRoute === null) {
            if (!empty($methodsForPath)) {
                header('Allow: ' . implode(', ', array_unique($methodsForPath)));
                jsonError('Method not allowed', 405);
            }
            jsonError('Not found: ' . $path, 404);
        }

        // Run middleware (each can short-circuit by calling jsonError/jsonResponse)
        foreach ($this->middleware as $mw) {
            $mw($matchedParams);
        }

        // Invoke the handler
        $handler = $matchedRoute['handler'];

        if (is_array($handler) && count($handler) === 2 && is_string($handler[0])) {
            // [ClassName::class, 'methodName']
            $controller = new $handler[0]();
            $controller->{$handler[1]}($matchedParams);
        } elseif (is_callable($handler)) {
            $handler($matchedParams);
        } else {
            jsonError('Invalid route handler', 500);
        }
    }

    /**
     * Register a route with method + path.
     */
    private function addRoute(string $method, string $path, $handler): self
    {
        $path = '/' . trim($path, '/');
        $params = [];

        // Convert :name segments to regex capture groups
        $regex = preg_replace_callback(
            '#:([a-zA-Z_][a-zA-Z0-9_]*)#',
            function ($matches) use (&$params) {
                $params[] = $matches[1];
                return '([^/]+)';
            },
            $path
        );

        $regex = '#^' . $regex . '$#';

        $this->routes[$method][] = [
            'pattern' => $path,
            'regex'   => $regex,
            'params'  => $params,
            'handler' => $handler,
        ];

        return $this;
    }
}
