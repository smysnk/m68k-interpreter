        ORG     $1000

TOTAL    DC.L    0

START
        MOVEQ   #0,D0
        MOVEQ   #1,D1

LOOP
        ADD.L   D1,D0
        ADDQ.L  #1,D1
        CMP.L   #11,D1
        BNE     LOOP

        MOVE.L  D0,TOTAL
        TRAP    #11
        DC.W    0

        END     START
