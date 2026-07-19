; Mirror the eight toggle switches to the LED bank.
; $E00010 is intentionally shared: reads are switches, writes are LEDs.
ORG $1000
START
  MOVE.B $E00010,D0
  MOVE.B D0,$E00010
  BRA START
  END START
