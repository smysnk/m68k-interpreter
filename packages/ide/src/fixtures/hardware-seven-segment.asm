; @m68k-ide/v1 layout=hardware-lab machine=easy68k cpu=m68000 focus=hardware-display speed=1 run=auto
; Write recognizable patterns to all eight seven-segment positions.
ORG $1000
START
  MOVE.B #$7D,$E00000
  MOVE.B #$7F,$E00002
  MOVE.B #$00,$E00004
  MOVE.B #$00,$E00006
  MOVE.B #$5B,$E00008
  MOVE.B #$3F,$E0000A
  MOVE.B #$5B,$E0000C
  MOVE.B #$7D,$E0000E
IDLE
  BRA IDLE
  END START
