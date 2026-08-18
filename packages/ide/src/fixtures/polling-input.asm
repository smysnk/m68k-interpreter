; @m68k-ide/v1 layout=terminal-focus machine=easy68k cpu=m68000 focus=terminal speed=1 run=auto
        ORG     $1000

START
        LEA     WAITING,A0
        BSR     PUTS

POLL
        MOVEQ   #7,D0
        TRAP    #15
        TST.B   D1
        BEQ     POLL

        LEA     READY,A0
        BSR     PUTS
        BSR     SGETCH
        MOVE.B  D0,RESULT
        MOVE.B  D0,D1
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

RESULT   DC.B    0
WAITING  DC.B    'Polling keyboard input...',13,10,0
READY    DC.B    'Input detected: ',0
NEWLINE  DC.B    13,10,0

        END     START
