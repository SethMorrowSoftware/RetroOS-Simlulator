# Tutorial 02 — Variables and Data

> **Goal.** Build an in-memory contact list using arrays of objects, then
> learn how to query it with the array builtins.

> **Prerequisites.** [Tutorial 01](01-first-steps.md). Comfort with
> `print` and string interpolation.

---

## Step 1 — Numbers, strings, booleans, null

```retro
set $age = 30
set $name = "Alice"
set $active = true
set $partner = null
```

Note:

- All variables start with `$`.
- Type is inferred from the literal. No type annotations exist.
- `true` / `false` / `null` are lowercase keywords (`True`, `TRUE`,
  etc., also work — RetroScript keywords are case-insensitive).

Confirm types with the `typeof` builtin:

```retro
print "" + (call typeof $age)        # number
print "" + (call typeof $name)       # string
print "" + (call typeof $active)     # boolean
print "" + (call typeof $partner)    # null
```

---

## Step 2 — Arrays

Arrays use `[ ]`:

```retro
set $colors = ["red", "green", "blue"]
set $nums = [1, 2, 3, 4, 5]
set $mixed = [1, "two", true, null, [9, 8, 7]]
```

Access elements by index:

```retro
print $colors[0]                  # red
print $colors[2]                  # blue
```

There is **no** negative indexing. `$colors[-1]` doesn't work. Use the
builtins instead:

```retro
print call last $colors           # blue
print call first $colors          # red
print "" + (call count $colors)   # 3
```

Or compute the index:

```retro
print $colors[call count $colors - 1]    # blue
```

---

## Step 3 — Objects

Objects use `{ }` with `key: value` pairs:

```retro
set $alice = { name: "Alice", age: 30, role: "admin" }
```

Read with dot notation:

```retro
print $alice.name                # Alice
print "" + $alice.age            # 30
```

Or with the `get` builtin when the key is dynamic:

```retro
set $field = "role"
print call get $alice $field     # admin
```

Write the same way:

```retro
set $alice.age = 31
print "" + $alice.age            # 31
```

Nested objects work as you'd expect:

```retro
set $user = {
  name: "Alice",
  address: { city: "Geneva", country: "CH" },
  tags: ["admin", "scripter"]
}

print $user.address.city          # Geneva
print $user.tags[0]               # admin
```

---

## Step 4 — A contact list

Let's build a small array of contact objects:

```retro
set $contacts = [
  { name: "Alice",  email: "alice@example.com",  vip: true,  score: 95 },
  { name: "Bob",    email: "bob@example.com",    vip: false, score: 60 },
  { name: "Carol",  email: "carol@example.com",  vip: true,  score: 88 },
  { name: "Dave",   email: "dave@example.com",   vip: false, score: 40 },
]
```

Note the trailing comma — RetroScript allows it. Newlines inside `[` and
`{` are fine.

---

## Step 5 — Iterating

```retro
foreach $c in $contacts {
  print $c.name + " <" + $c.email + ">"
}
```

For numerical indices, use the two-variable form:

```retro
foreach $i, $c in $contacts {
  print "" + $i + ". " + $c.name
}
```

(`$i` is also automatically set by every `foreach` even if you don't
ask for it — but you can't *also* name your loop variable `$i`, or it
gets clobbered. See [GUIDE.md §4](../GUIDE.md#4-control-flow).)

---

## Step 6 — Querying with the array builtins

This is where the project's array library shines.

### Extract a property from every object

```retro
set $names = call mapBy $contacts "name"
print call toJSON $names
# ["Alice","Bob","Carol","Dave"]
```

### Filter by a property value

```retro
set $vips = call filterBy $contacts "vip" true
print "" + (call count $vips)        # 2

foreach $c in $vips {
  print $c.name
}
```

### Sort by a property

```retro
set $bottom_up = call sortBy $contacts "score"
set $top_down = call sortByDesc $contacts "score"

print "Top: " + $top_down[0].name    # Top: Alice
print "Bottom: " + $bottom_up[0].name # Bottom: Dave
```

### Find the first match

```retro
set $bob = call findBy $contacts "name" "Bob"
print "Bob's email: " + $bob.email
```

### Group by a property

```retro
set $by_vip = call groupBy $contacts "vip"
print "" + (call count $by_vip.true)    # 2
print "" + (call count $by_vip.false)   # 2
```

`groupBy` returns an object whose keys are the property values
stringified, and whose values are arrays of matching items.

### Aggregate

```retro
set $scores = call mapBy $contacts "score"
print "Avg score: " + (call avg $scores)
print "Max score: " + (call max $scores)
print "Total: "    + (call sum $scores)
```

---

## Step 7 — Mutating the list

There are two flavors of array operations: **mutating** and
**immutable**. They look similar but behave very differently.

### Mutating (in-place)

```retro
set $arr = [1, 2, 3]
call push $arr 4 5             # $arr is now [1, 2, 3, 4, 5]
call unshift $arr 0            # $arr is now [0, 1, 2, 3, 4, 5]

set $last_pushed = call pop $arr    # returns 5, $arr is [0,1,2,3,4]
set $first_popped = call shift $arr # returns 0, $arr is [1,2,3,4]
```

`push`, `pop`, `shift`, `unshift` **modify `$arr` in place**. `pop` and
`shift` also return the removed element.

### Immutable (new array)

```retro
set $sorted = call sort [3, 1, 2]       # [1, 2, 3]; original unchanged
set $unique = call unique [1, 1, 2, 2]  # [1, 2]; original unchanged
set $reversed = call reverse [1, 2, 3]  # [3, 2, 1]; original unchanged
```

When in doubt, check the [DICTIONARY → Array](../DICTIONARY.md#array)
table — mutation behavior is called out per builtin.

---

## Step 8 — Persisting via JSON

Convert the contact list to a JSON string:

```retro
set $json = call prettyJSON $contacts 2
print $json
```

Output (formatted):

```json
[
  {
    "name": "Alice",
    "email": "alice@example.com",
    "vip": true,
    "score": 95
  },
  ...
]
```

Parse it back:

```retro
set $loaded = call fromJSON $json
print "" + (call count $loaded)        # 4
```

We'll persist this to disk in [Tutorial 05](05-files-and-storage.md).

---

## Try it — checklist

Run this complete script:

```retro
set $contacts = [
  { name: "Alice",  email: "alice@example.com",  vip: true,  score: 95 },
  { name: "Bob",    email: "bob@example.com",    vip: false, score: 60 },
  { name: "Carol",  email: "carol@example.com",  vip: true,  score: 88 },
  { name: "Dave",   email: "dave@example.com",   vip: false, score: 40 },
]

print "VIPs:"
foreach $c in (call filterBy $contacts "vip" true) {
  print "  " + $c.name + " (" + (call toString $c.score) + ")"
}

set $top = (call sortByDesc $contacts "score")[0]
print "Highest: " + $top.name + " — " + (call toString $top.score)

print "Avg: " + (call avg (call mapBy $contacts "score"))
```

You should see:

```
VIPs:
  Alice (95)
  Carol (88)
Highest: Alice — 95
Avg: 70.75
```

- [ ] The VIPs section shows two names.
- [ ] The "Highest" line shows Alice.
- [ ] The average is `70.75`.

---

## Exercises

1. Add an `Eve` with score `72` and `vip: true`, then re-run. The VIPs
   list should grow; Alice should still be the top.
2. Print the contact list sorted alphabetically by `name` (ascending).
3. Build a `byScoreBucket` object using `groupBy` where the key is
   `"high"` (score ≥ 80) or `"low"` (< 80). Hint: add a derived `bucket`
   property in a loop first.
4. Use `coalesce` to print `$contact.nickname || $contact.name` so a
   missing nickname falls back to the real name. Add a `nickname` to
   one contact to verify.
5. Combine `mapBy` and `unique` to print the deduplicated list of
   `vip` values (should be `[true, false]`).

---

## What's next

[Tutorial 03 — Control Flow and Functions](03-control-flow.md) uses
this contact list as the data for a small reusable scoring engine.
