# Focused tests

These fixtures exercise only Freelang Doom Source and build their own minimal
Doom-format bytes. They contain no WAD content.

Run them with the test runner from a compatible Freelang builder checkout. For
example, from that checkout:

```bash
bash tests/run-all.sh --hide-passes \
  /path/to/freelang-doom-source/tests/doom-actions.flx \
  /path/to/freelang-doom-source/tests/doom-audio.flx \
  /path/to/freelang-doom-source/tests/doom-combat.flx \
  /path/to/freelang-doom-source/tests/doom-session.flx \
  /path/to/freelang-doom-source/tests/doom-texture.flx \
  /path/to/freelang-doom-source/tests/doom-world.flx \
  /path/to/freelang-doom-source/tests/doom-bsp.flx
```

The separately licensed builder supplies the compiler, standard library and
test harness.
