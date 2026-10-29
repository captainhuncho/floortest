# Testing evidence

One report per production release (working rule 13, principle 9). Read the latest before deciding the next changes. A release whose whole change is inside this folder gets no report of its own (any other file, even docs or tests, still counts): the next release's report lists it in one line (PR, merge commit, deployment).

**File name:** `YYYY-MM-DD-<short name>-<commit>.md`, the commit being the one production runs. Screenshots go beside it as `YYYY-MM-DD-<short name>-<what>.png` (or `.jpg`), under 300 KB each.

**Each report has, in this order:**

1. **Build:** the production commit, the preview commit if different, and the deployment ID.
2. **What shipped:** one line per change, with its commit.
3. **Checks:** a table; every row is `passed`, `failed` or `blocked` (with why). Name the build each check ran on.
4. **Status:** what is built, tested, live and still unfinished, each said plainly.
5. **Rollback:** the last good deployment and anything that makes rolling back unsafe.
6. **Next:** one line.

Blocked is honest, not a failure: a check that needs a real account, a dashboard only the owner sees, or a device we don't have is marked blocked and says what would unblock it.
