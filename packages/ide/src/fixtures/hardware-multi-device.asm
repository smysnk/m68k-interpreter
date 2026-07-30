; Exercise two independently mapped seven-segment displays and two digital I/O boards.
; The browser independence test configures the panels to these named address ranges.
ORG $1000
START
  MOVE.B #$3F,$E00000
  MOVE.B #$06,$E00020
LOOP
  MOVE.B $E00040,D0
  MOVE.B D0,$E00040
  MOVE.B $E00050,D1
  MOVE.B D1,$E00050
  BRA LOOP
  END START
