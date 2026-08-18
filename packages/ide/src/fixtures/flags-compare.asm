; @m68k-ide/v1 layout=debug machine=easy68k cpu=m68000 focus=registers speed=0.25 run=manual
        ORG     $1000

RESULT   DC.B    0

START
        MOVE.L  #42,D0
        CMP.L   #42,D0
        BEQ     VALUES_MATCH

        MOVE.B  #0,RESULT
        BRA     DONE

VALUES_MATCH
        MOVE.B  #1,RESULT

DONE
        MOVEQ   #9,D0
        TRAP    #15

        END     START
