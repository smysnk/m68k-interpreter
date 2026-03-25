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
        TRAP    #11
        DC.W    0

        END     START
