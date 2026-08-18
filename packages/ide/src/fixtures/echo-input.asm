; @m68k-ide/v1 layout=terminal-focus machine=easy68k cpu=m68000 focus=terminal speed=1 run=auto
        ORG     $1000

START
        LEA     PROMPT,A0
        BSR     PUTS
        BSR     SGETCH
        MOVE.B  D0,LAST_KEY
        LEA     LABEL,A0
        BSR     PUTS
        MOVE.B  LAST_KEY,D1
        MOVEQ   #6,D0
        TRAP    #15
        LEA     NEWLINE,A0
        BSR     PUTS
        MOVEQ   #9,D0
        TRAP    #15

SGETCH
        MOVEQ   #5,D0
        TRAP    #15
        MOVE.B  D1,D0
        RTS

PUTS
        MOVE.B  (A0)+,D0
        TST.B   D0
        BEQ     PUTS_DONE
        MOVE.B  D0,D1
        MOVEQ   #6,D0
        TRAP    #15
        BRA     PUTS

PUTS_DONE
        RTS

LAST_KEY DC.B    0
PROMPT   DC.B    'Press any key: ',0
LABEL    DC.B    13,10,'You pressed: ',0
NEWLINE  DC.B    13,10,0

        END     START
