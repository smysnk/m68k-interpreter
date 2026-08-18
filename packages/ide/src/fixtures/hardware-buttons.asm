; @m68k-ide/v1 layout=hardware-lab machine=easy68k cpu=m68000 focus=hardware-digital-io speed=1 run=auto
; Active-low momentary buttons: released=$FF, pressed bits read as zero.
; The current button byte is copied to the LEDs for easy inspection.
ORG $1000
START
  MOVE.B $E00012,D0
  MOVE.B D0,$E00010
  BRA START
  END START
