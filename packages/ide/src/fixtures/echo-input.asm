        ORG     $1000

START
        LEA     PROMPT,A0
        BSR     PUTS
        BSR     SGETCH
        MOVE.B  D0,LAST_KEY
        LEA     LABEL,A0
        BSR     PUTS
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

LAST_KEY DC.B    0
PROMPT   DC.B    'Press any key: ',0
LABEL    DC.B    13,10,'You pressed: ',0
NEWLINE  DC.B    13,10,0

        END     START
