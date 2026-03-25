        ORG     $1000

START
        LEA     MESSAGE,A0
        BSR     PUTS
        TRAP    #11
        DC.W    0

PUTS
        MOVE.B  (A0)+,D0
        TST.B   D0
        BEQ     PUTS_DONE
        TRAP    #15
        DC.W    1
        BRA     PUTS

PUTS_DONE
        RTS

MESSAGE  DC.B    'Hello from the Motorola 68000 browser IDE!',13,10,0

        END     START
