# house-scene-format v1.0.1 (a copy, for the tests)

The checker, its schemas, the sample scene, the sample bake (task 0032) and the sample maker of the public repository
[smholte/house-scene-format](https://github.com/smholte/house-scene-format) at tag **v1.0.1** (commit 89bc92d),
unchanged. House Planner pins this version (task 0031): `tests/test_hpscene.py` lays out and hashes the sample with the
app's JavaScript and checks the app's own export with `check.py`. A new format version: copy the new tag's files here.

    python3 tests/house-scene-format/check.py <file.hpscene>      (needs jsonschema: tools/requirements-dev.txt)
