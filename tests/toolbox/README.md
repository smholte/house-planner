# toolbox-format v0.1 (a copy, for the tests)

The checker (`check.py`, `tbf/`), its schemas, the built-in type list (`types.json`), the sample Toolbox folder (`samples/Toolbox`; not
`samples/files`: the public precheck keeps model files out) and the reference
code for a web tool (`web/toolbox-folder.js`) of the public repository
[smholte/toolbox-format](https://github.com/smholte/toolbox-format) at tag **v0.1** (commit aa75e85), unchanged
(MIT, `LICENSE`). House Planner pins this version (task 0042): the app's `src/toolbox-folder.js` is this
`web/toolbox-folder.js` with one first line naming the tag, and `tests/test_toolbox.py` runs what the app writes
through `check.py`. A new format version: copy the new tag's files here and into `src/`.

    python3 tests/toolbox/check.py <Toolbox folder | job folder | toolbox.json>     (needs jsonschema)
