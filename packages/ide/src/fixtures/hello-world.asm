; Hello World for the Motorola 68000 browser IDE
        ORG     $1000

START
        LEA     MESSAGE,A0
        BSR     PUTS
        MOVEQ   #9,D0
        TRAP    #15

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

MESSAGE  DC.B    'Hello World!',13,10,0

        END     START
