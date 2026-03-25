        ORG     $1000

COUNTER  DC.L    0

START
        MOVEQ   #0,D0
        BSR     INCREMENT
        BSR     INCREMENT
        BSR     INCREMENT
        MOVE.L  D0,COUNTER
        TRAP    #11
        DC.W    0

INCREMENT
        ADDQ.L  #1,D0
        RTS

        END     START
