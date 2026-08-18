; @m68k-ide/v1 layout=hardware-lab machine=easy68k cpu=m68000 focus=hardware-digital-io speed=1 run=auto
; Mirror the eight toggle switches to the LED bank.
; $E00010 is intentionally shared: reads are switches, writes are LEDs.
ORG $1000
START
  MOVE.B $E00010,D0
  MOVE.B D0,$E00010
  BRA START
  END START
