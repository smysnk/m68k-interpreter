        ORG     $1000

SOURCE   DC.B    'Copy me into DEST',0
DEST     DS.B    18

START
        LEA     SOURCE,A0
        LEA     DEST,A1

COPY_LOOP
        MOVE.B  (A0)+,D0
        MOVE.B  D0,(A1)+
        TST.B   D0
        BNE     COPY_LOOP

        TRAP    #11
        DC.W    0

        END     START
