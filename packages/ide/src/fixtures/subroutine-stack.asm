; @m68k-ide/v1 layout=debug machine=easy68k cpu=m68000 focus=code speed=0.25 run=manual
        ORG     $1000

COUNTER  DC.L    0

START
        MOVEQ   #0,D0
        BSR     INCREMENT
        BSR     INCREMENT
        BSR     INCREMENT
        MOVE.L  D0,COUNTER
        MOVEQ   #9,D0
        TRAP    #15

INCREMENT
        ADDQ.L  #1,D0
        RTS

        END     START
