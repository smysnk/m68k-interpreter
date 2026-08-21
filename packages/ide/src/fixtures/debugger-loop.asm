; @m68k-ide/v1 layout=debug cpu=m68000 machine=bare speed=0.25 run=manual
; Debugger tour:
; 1. Put a breakpoint on LOOP or UPDATE_SCORE with F9.
; 2. Watch D0 and SCORE, then use Step Over on BSR.
; 3. Step Into enters UPDATE_SCORE; Step Out returns to the loop.
; 4. Right-click SCORE in Memory to add a write data breakpoint.

        ORG     $1000

SCORE   DC.L    0

START   MOVEQ   #0,D0

LOOP    BSR     UPDATE_SCORE
        CMPI.L  #10,D0
        BLT     LOOP

DONE    BRA     DONE

UPDATE_SCORE
        ADDQ.L  #1,D0
        MOVE.L  D0,SCORE
        RTS

        END     START
