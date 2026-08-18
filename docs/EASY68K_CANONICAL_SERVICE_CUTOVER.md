# Canonical Easy68K Service Cutover

The Easy68K machine profile now implements one canonical simulator-service ABI.
There is no legacy selector or automatic source rewriting.

## Source migration

| Previous repository convention                       | Canonical source                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `TRAP #15` followed by `DC.W 1`, character in `D0.B` | Put the character in `D1.B`, put `6` in `D0.B`, then execute `TRAP #15` |
| `TRAP #15` followed by `DC.W 3`                      | Put `5` in `D0.B`; the returned character is in `D1.B`                  |
| Task `4` with a Z-flag result                        | Put `7` in `D0.B`; explicitly test the returned `D1.B`                  |
| `TRAP #11` followed by `DC.W 0`                      | Put `9` in `D0.B`, then execute `TRAP #15`                              |

The word after `TRAP #15` is always the next instruction. Repository examples,
tests, and benchmarks were migrated together with the dispatcher.

## Graphics

Tasks `80` through `96` operate on a deterministic machine-owned pixel surface.
Colors use Easy68K `$00BBGGRR` encoding. The IDE transports dirty rectangles to
one or more Graphics panels; Canvas is a renderer, not the emulated state.

## Sound assets

Tasks `70` through `77` resolve WAV paths through the current project asset
manifest. Use **Add WAV** in a Sound panel to register a browser-safe,
project-relative asset. WAV files are validated, size bounded, and persisted in
browser storage. Absolute paths, traversal, URL schemes, and arbitrary network
fetches are rejected.

Browser audio may require a user gesture. Run, Resume, Step, and **Enable audio**
attempt to unlock the shared audio host. Mute and volume are host preferences;
they do not change emulated machine state. Audio already heard cannot be
retracted by Undo, though logical references and loop intent are restored.
