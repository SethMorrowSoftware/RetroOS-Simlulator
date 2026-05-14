# Tutorial 01 — First Steps

> **Goal.** Run your first RetroScript file, print to the console, and
> get comfortable with comments, strings, and the most common gotchas.

> **Prerequisites.** A running IlluminatOS instance (open in a browser).
> Nothing else.

---

## Step 1 — Open Script Runner and write `hello.retro`

In IlluminatOS, click **Start → Accessories → Script Runner** (or
double-click the Script Runner icon on the desktop). You should see a
two-pane window: source on the left, output console on the right.

Paste this into the source pane:

```retro
print "Hello, RetroScript!"
```

Click **Run**. The output pane should show:

```
Hello, RetroScript!
```

Congratulations — you just exercised the lexer, the parser, the
interpreter, and the event-bus print pathway in one statement.

---

## Step 2 — Save as a real file

Scripts work better when you can re-run them. Save the script:

1. From inside the OS, open **Notepad** (Start → Accessories → Notepad).
2. Paste the line and save as
   `C:/Users/User/Documents/hello.retro`.
3. In Script Runner, click **Open** and load the file.

You should be able to re-run it as many times as you like by hitting
**Run** again. Each run is a fresh execution — no leftover state.

---

## Step 3 — Comments

Add a comment to your script:

```retro
# My very first RetroScript program.
print "Hello, RetroScript!"
```

The `#` and everything after it on the line are ignored. Save and run —
the output should be unchanged.

> **Gotcha.** Don't use `;` for comments. Semicolons are *statement
> separators* in RetroScript — `; some text` is a parse error.

---

## Step 4 — String interpolation

Strings in RetroScript can include variable values directly. Edit the
script:

```retro
set $who = "world"
print "Hello, $who!"
```

Output:

```
Hello, world!
```

The `$who` inside the string is replaced with the current value of the
variable. If the variable doesn't exist, the literal `$who` text is
left in place — no error.

Try `print "$missing"` to see this — it prints the literal `$missing`.

---

## Step 5 — Escape sequences

Sometimes you want literal quotes, tabs, or newlines:

```retro
print "Line one\nLine two\tTabbed."
print "She said \"hi\"."
```

Output:

```
Line one
Line two	Tabbed.
She said "hi".
```

The full set: `\n` `\t` `\r` `\"` `\'` `\\` `\0`. Anything else (e.g.
`\x`) becomes just the character — `\x` → `x`.

---

## Step 6 — The two faces of `print`

`print` has a personality split that catches everyone the first time.

**Quoted-string-first → expression mode.** `+` concatenates / adds:

```retro
print "Score: " + 100              # Score: 100
print "Sum: " + (2 + 3)            # Sum: 5
```

**Other-token-first → unquoted text mode.** `+` is *literal*, and
`$vars` are interpolated:

```retro
set $name = "Alice"
print Hello $name, welcome!        # Hello Alice, welcome!
print 2 + 3                        # 2 + 3   (literal!)
```

If you ever see `2 + 3` printed as `"2 + 3"` instead of `5`, you're in
unquoted-text mode. Fix it by quoting the first token:

```retro
print "" + (2 + 3)                 # 5
```

Or assigning first:

```retro
set $r = 2 + 3
print "" + $r                      # 5
```

This is by far the most common surprise in early RetroScript code, so
internalize the rule now: **start with a quoted string when you want
expressions to compute, start with anything else when you want
interpolation.**

---

## Step 7 — Multiple statements per line

A newline ends a statement. A semicolon ends a statement too:

```retro
set $a = 1; set $b = 2; print "" + ($a + $b)
```

That's exactly equivalent to:

```retro
set $a = 1
set $b = 2
print "" + ($a + $b)
```

Use newlines for readability — semicolons mostly belong in REPL-style
one-liners and the terminal `retro -c "..."` form.

---

## Try it — checklist

Run the final script:

```retro
# First steps in RetroScript.
set $who = "world"
print "Hello, $who!"
print "She said \"hello\" and waved."
print "" + (2 + 3 * 4)
```

You should see:

```
Hello, world!
She said "hello" and waved.
14
```

- [ ] All three lines printed without errors.
- [ ] The third line printed `14`, not `2 + 3 * 4`.
- [ ] You can re-run the script from Script Runner without re-opening
      the file.

---

## Exercises

1. Print a banner using `\n` escapes:

   ```
   ============
    HELLO!
   ============
   ```

2. Set three variables (`$name`, `$age`, `$role`) and print a single
   line that interpolates all three.

3. Predict the output, then test:

   ```retro
   print "" + 1 + 2 + 3
   print "" + (1 + 2 + 3)
   ```

   They look similar — they aren't. Why? (Hint: `+` is left-associative
   and "string-or-number".)

4. Comment out one of your `print` lines using `#`, then run again and
   confirm it didn't execute.

---

## What's next

[Tutorial 02 — Variables and Data](02-variables-and-data.md) builds a
JSON-backed contact list and introduces arrays, objects, and the
collection builtins.
