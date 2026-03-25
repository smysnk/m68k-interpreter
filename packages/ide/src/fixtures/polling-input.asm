        ORG     $1000

START
        LEA     WAITING,A0
        BSR     PUTS

POLL
        TRAP    #15
        DC.W    4
        BEQ     POLL

        LEA     READY,A0
        BSR     PUTS
        BSR     SGETCH
        MOVE.B  D0,RESULT
        TRAP    #15
        DC.W    1
        LEA     NEWLINE,A0
        BSR     PUTS
        TRAP    #11
        DC.W    0

SGETCH
        TRAP    #15
        DC.W    3
        RTS

PUTS
        MOVE.B  (A0)+,D0
        TST.B   D0
        BEQ     PUTS_DONE
        TRAP    #15
        DC.W    1
        BRA     PUTS

PUTS_DONE
        RTS

RESULT   DC.B    0
WAITING  DC.B    'Polling keyboard input...',13,10,0
READY    DC.B    'Input detected: ',0
NEWLINE  DC.B    13,10,0

        END     START
