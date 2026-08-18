; @m68k-ide/v1 layout=debug machine=easy68k cpu=m68000 focus=registers speed=1 run=auto
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
        MOVEQ   #9,D0
        TRAP    #15

        END     START
