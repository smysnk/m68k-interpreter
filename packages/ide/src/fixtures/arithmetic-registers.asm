        ORG     $1000

VALUE_A  DC.L    12
VALUE_B  DC.L    5
SUM      DC.L    0
DIFF     DC.L    0
DOUBLE   DC.L    0

START
        MOVE.L  VALUE_A,D0
        MOVE.L  VALUE_B,D1

        MOVE.L  D0,D2
        ADD.L   D1,D2
        MOVE.L  D2,SUM

        MOVE.L  D0,D3
        SUB.L   D1,D3
        MOVE.L  D3,DIFF

        MOVE.L  D1,D4
        ADD.L   D4,D4
        MOVE.L  D4,DOUBLE

        TRAP    #11
        DC.W    0

        END     START
