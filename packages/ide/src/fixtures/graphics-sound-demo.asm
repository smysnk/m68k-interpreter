; @m68k-ide/v1 layout=multimedia machine=easy68k cpu=m68000 focus=graphics speed=1 run=auto graphics-scale=fit graphics-smoothing=false
        ORG     $1000

; Easy68K graphics service constants.
BACKGROUND      EQU     $001E0F08      ; RGB #080F1E encoded as BGR
WALL_COLOR      EQU     $00F8BD38      ; RGB #38BDF8 encoded as BGR
BALL_COLOR      EQU     $0024BFFB      ; RGB #FBBF24 encoded as BGR
BALL_EDGE       EQU     $00FFFFFF

WALL_LEFT       EQU     40
WALL_RIGHT      EQU     599
WALL_TOP        EQU     40
WALL_BOTTOM     EQU     439
BALL_RADIUS     EQU     12
BALL_MIN_X      EQU     53             ; wall + one pixel + radius
BALL_MAX_X      EQU     586
BALL_MIN_Y      EQU     53
BALL_MAX_Y      EQU     426
BOUNCE_SOUND    EQU     1
FRAME_DELAY     EQU     12000

START
        ; Enable the back buffer. Drawing mode 17 selects double buffering;
        ; task 94 copies the completed back buffer to the visible surface.
        MOVEQ   #17,D1
        MOVEQ   #92,D0
        TRAP    #15

        ; Paint the initial background.
        MOVE.L  #BACKGROUND,D1
        MOVEQ   #81,D0
        TRAP    #15
        MOVE.L  #BACKGROUND,D1
        MOVEQ   #80,D0
        TRAP    #15
        MOVE.W  #0,D1
        MOVE.W  #0,D2
        MOVE.W  #639,D3
        MOVE.W  #479,D4
        MOVEQ   #87,D0
        TRAP    #15

        ; Add a title above the arena.
        MOVE.L  #WALL_COLOR,D1
        MOVEQ   #80,D0
        TRAP    #15
        LEA     TITLE,A1
        MOVE.W  #260,D1
        MOVE.W  #16,D2
        MOVEQ   #95,D0
        TRAP    #15

        BSR     DRAW_WALL
        BSR     DRAW_BALL

        MOVEQ   #94,D0
        TRAP    #15

        ; Load beep.wav once as polyphonic reference 1. Browser audio starts
        ; after the user selects "Enable audio" in the Sound panel.
        LEA     BEEP,A1
        MOVEQ   #BOUNCE_SOUND,D1
        MOVEQ   #74,D0
        TRAP    #15

FRAME_LOOP
        ; Remove the ball from its old position in the persistent back buffer.
        BSR     ERASE_BALL

        ; Integrate one frame of horizontal momentum and resolve either wall.
        MOVEQ   #0,D6                  ; one sound at most per rendered frame
        MOVE.W  BALL_X,D5
        ADD.W   VELOCITY_X,D5
        CMP.W   #BALL_MIN_X,D5
        BGE     CHECK_RIGHT_WALL
        MOVE.W  #BALL_MIN_X,D5
        NEG.W   VELOCITY_X
        MOVEQ   #1,D6
        BRA     STORE_X
CHECK_RIGHT_WALL
        CMP.W   #BALL_MAX_X,D5
        BLE     STORE_X
        MOVE.W  #BALL_MAX_X,D5
        NEG.W   VELOCITY_X
        MOVEQ   #1,D6
STORE_X
        MOVE.W  D5,BALL_X

        ; Integrate vertical momentum independently so corner impacts reverse
        ; both components without increasing or reducing the ball's speed.
        MOVE.W  BALL_Y,D5
        ADD.W   VELOCITY_Y,D5
        CMP.W   #BALL_MIN_Y,D5
        BGE     CHECK_BOTTOM_WALL
        MOVE.W  #BALL_MIN_Y,D5
        NEG.W   VELOCITY_Y
        MOVEQ   #1,D6
        BRA     STORE_Y
CHECK_BOTTOM_WALL
        CMP.W   #BALL_MAX_Y,D5
        BLE     STORE_Y
        MOVE.W  #BALL_MAX_Y,D5
        NEG.W   VELOCITY_Y
        MOVEQ   #1,D6
STORE_Y
        MOVE.W  D5,BALL_Y

        ; A corner is still one collision event, so play one polyphonic beep.
        CMP.B   #0,D6
        BEQ     DRAW_FRAME
        MOVEQ   #BOUNCE_SOUND,D1
        MOVEQ   #75,D0
        TRAP    #15

DRAW_FRAME
        BSR     DRAW_BALL
        BSR     DRAW_WALL               ; keep the border crisp at contact
        MOVEQ   #94,D0
        TRAP    #15

        ; The IDE has no wall-clock sleep trap. This deterministic instruction
        ; gate keeps the worker responsive and makes motion visible at speed 1.
        MOVE.W  #FRAME_DELAY,D7
FRAME_GATE
        SUBQ.W  #1,D7
        BNE     FRAME_GATE
        BRA     FRAME_LOOP

ERASE_BALL
        MOVE.L  #BACKGROUND,D1
        MOVEQ   #81,D0
        TRAP    #15
        MOVE.L  #BACKGROUND,D1
        MOVEQ   #80,D0
        TRAP    #15
        BSR     BALL_BOUNDS
        MOVEQ   #88,D0
        TRAP    #15
        RTS

DRAW_BALL
        MOVE.L  #BALL_COLOR,D1
        MOVEQ   #81,D0
        TRAP    #15
        MOVE.L  #BALL_EDGE,D1
        MOVEQ   #80,D0
        TRAP    #15
        BSR     BALL_BOUNDS
        MOVEQ   #88,D0
        TRAP    #15
        RTS

; Return the ball's bounding rectangle in D1.W through D4.W.
BALL_BOUNDS
        MOVE.W  BALL_X,D1
        MOVE.W  BALL_Y,D2
        MOVE.W  BALL_X,D3
        MOVE.W  BALL_Y,D4
        SUB.W   #BALL_RADIUS,D1
        SUB.W   #BALL_RADIUS,D2
        ADD.W   #BALL_RADIUS,D3
        ADD.W   #BALL_RADIUS,D4
        RTS

DRAW_WALL
        MOVE.L  #WALL_COLOR,D1
        MOVEQ   #80,D0
        TRAP    #15
        MOVEQ   #3,D1
        MOVEQ   #93,D0
        TRAP    #15
        MOVE.W  #WALL_LEFT,D1
        MOVE.W  #WALL_TOP,D2
        MOVE.W  #WALL_RIGHT,D3
        MOVE.W  #WALL_BOTTOM,D4
        MOVEQ   #90,D0
        TRAP    #15
        RTS

BALL_X          DC.W    160
BALL_Y          DC.W    120
VELOCITY_X      DC.W    5
VELOCITY_Y      DC.W    3
TITLE           DC.B    'BOUNCE + SOUND',0
BEEP            DC.B    'beep.wav',0

        END     START
