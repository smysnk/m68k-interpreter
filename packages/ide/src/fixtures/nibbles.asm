;=============================================================================
;        File: nibbles.asm
;      Author: Joshua Bellamy-Henn
;             � 2015 Psidox
;
; Description: Remake of Nibbles game for the Motorola 68000.
;
; How to Play: Use W,S,A,D keys or (keypad 8,4,5,6) to change direction, objective 
;              is to grow the snake as long as possible by eating food placed in 
;              random locations around the arena.  Don't run into your own trail 
;              or into wall you will die!!!
;
;=============================================================================

CHAR_CR EQU     $0D

DUART   EQU     $600000
MR1A    EQU     1
SRA     EQU     3
RBA     EQU     7       ; Receiver buffer register (data in)
TBA     EQU     7       ; Transmitter buffer register (data out)
RxRDY   EQU     0       ; Reciver ready bit
TxRDY   EQU     2       ; Transmitter ready bit

DIR_LEFT  EQU   0
DIR_RIGHT EQU   1
DIR_UP    EQU   2
DIR_DOWN  EQU   3

LAYOUT_DESKTOP EQU 0
LAYOUT_MOBILE_LANDSCAPE EQU 1
LAYOUT_MOBILE_PORTRAIT EQU 2
LAYOUT_PROFILE_UNKNOWN EQU $FF

GAME_MODE_INTRO EQU 0
GAME_MODE_PLAY EQU 1
GAME_MODE_GAMEOVER EQU 2

TOUCH_PHASE_DOWN EQU 1
TOUCH_PHASE_MOVE EQU 2
TOUCH_PHASE_UP EQU 3

WALL_LIFE EQU   $FFFE     ; Wall Special Time
FOOD_LIFE EQU   $FFFF     ; Food Special Time
FOOD_GROWTH EQU 1       ; Grow by one segment for each food item

SNK_START_LIFE  EQU   5      ; Life of single segment of the snake
; Browser-tuned movement gates. The original board-oriented delays were
; much slower under the worker/runtime path and capped visible gameplay cadence.
SNK_SPEED_EASY  EQU   $00003800
SNK_SPEED_MEDIUM EQU  $00002C00
SNK_SPEED_HARD EQU    $00002000
SNK_SPEED_INSANE EQU  $00001000

SNK_SCR_SIZE EQU 1920   ; default 80x24 gameplay surface

ARENA_X EQU     80
ARENA_ROWS EQU  24
MAX_ARENA_X EQU 100
MAX_ARENA_ROWS EQU 60
MAX_SNK_SCR_SIZE EQU 6000
ARENA_Y EQU     23

START_X EQU     38
START_Y EQU     10

WALL_CHAR_VERTICAL EQU $B3
WALL_CHAR_HORIZONTAL EQU $C4
WALL_CHAR_TOP_LEFT EQU $DA
WALL_CHAR_TOP_RIGHT EQU $BF
WALL_CHAR_BOTTOM_LEFT EQU $C0
WALL_CHAR_BOTTOM_RIGHT EQU $D9

        ORG     $4000              
        
NIBBLES ;initialize values that retain value between games        
        MOVE.B  #1,DIFFICULTY            

intro   ;initialize values that will reset at start of each game
        MOVE.B #0,LEVEL   ; player starts at level 0 (aka level 1) initially 
        MOVE.B #0,SCORE    ; Reset Score
        MOVE.B #0,FOOD_NUM ; Reset Score
        MOVE.B #5,LIVES    ; Set starting lives 
        BSR _INIT_LAYOUT
        MOVE.B #GAME_MODE_INTRO,GAME_MODE
        BSR _DRAW_INTRO_SCREEN
        BSR _SELECT_DIFF ; Let user select difficulty     

        
loadlevel    
        ;initialize values that will reset at start of each level / life
        BSR _INIT_LAYOUT
        MOVE.W #SNK_START_LIFE, SNK_LIFE
        MOVE.L #0,TIMER        ; Init Timer to 0
        MOVE.W #0,RAND_MEM     ; Random Memory Location
        MOVE.B #4,DIRECTION    ; No direction
        MOVE.B #4,LAST_DIR     ; No last direction
        MOVE.B #0,MOVING
        MOVE.L #0,TIMER
        MOVE.B #0,FOOD_AVAIL
        MOVE.B #0,DELAY_DECAY
        MOVE.B #GAME_MODE_PLAY,GAME_MODE
        BSR _CONFIGURE_GAMEPLAY_VIEW
        BSR _LOCK_VIEWPORT_ORIGIN
        BSR _SET_START_POSITION
        BSR _DRAW_ARENA_SCREEN
        BSR     _CLEARMEM    ; Clear Arena Memory
        BSR     _BUILD_MOBILE_BORDER_LEVEL
        BSR     _DRAW_MOBILE_BORDER_ARENA
        BSR     _DRAW_HUD
        BSR     _DRAWSNK

start
        TRAP	#15 ; check if we have a character waiting for us
	  DC.W	4
	  BEQ movesnk; if not, move on  
        BSR _SGETCH  ; else, get the character

        ; check for WASD
        CMP.B  #'w',D0 ; check if up arrow was pressed
        BEQ    key_up
         
        CMP.B  #'s',D0 ; check if down arrow was pressed
        BEQ    key_down

        CMP.B  #'a',D0 ; check if left arrow was pressed
        BEQ    key_left

        CMP.B  #'d',D0 ; check if right arrow was pressed
        BEQ    key_right

        ; check for KEYPAD
        CMP.B  #'8',D0 ; check if up arrow was pressed
        BEQ    key_up
         
        CMP.B  #'5',D0 ; check if down arrow was pressed
        BEQ    key_down

        CMP.B  #'4',D0 ; check if left arrow was pressed
        BEQ    key_left

        CMP.B  #'6',D0 ; check if right arrow was pressed
        BEQ    key_right


        BRA    movesnk; if no key was pressed that means anything move on

key_up
        BSR _REQUEST_DIR_UP
        BRA movesnk

key_down
        BSR _REQUEST_DIR_DOWN
        BRA movesnk

key_left
        BSR _REQUEST_DIR_LEFT
        BRA movesnk

key_right 
        BSR _REQUEST_DIR_RIGHT
        BRA movesnk

_REQUEST_DIR_UP
        CMP.B  #DIR_DOWN, LAST_DIR
        BEQ    req_dir_done
        MOVE.B #1, MOVING
        MOVE.B #DIR_UP, DIRECTION
req_dir_done
        RTS

_REQUEST_DIR_DOWN
        CMP.B  #DIR_UP, LAST_DIR
        BEQ    req_dir_done_down
        MOVE.B #1, MOVING
        MOVE.B #DIR_DOWN, DIRECTION
req_dir_done_down
        RTS

_REQUEST_DIR_LEFT
        CMP.B  #DIR_RIGHT, LAST_DIR
        BEQ    req_dir_done_left
        MOVE.B #1, MOVING
        MOVE.B #DIR_LEFT, DIRECTION
req_dir_done_left
        RTS

_REQUEST_DIR_RIGHT
        CMP.B  #DIR_LEFT, LAST_DIR
        BEQ    req_dir_done_right
        MOVE.B #1, MOVING
        MOVE.B #DIR_RIGHT, DIRECTION
req_dir_done_right
        RTS


movesnk CMP.B #0, MOVING  ; check if snake is moving
        BEQ incrand       ; if not, only thing to do is increase random counter, and repeat

        MOVE.L TIMER,D0
        ADDI.L #1, D0
        MOVE.L D0, TIMER

        CMP.L  SNK_SPEED,D0   ; Compare Timer with movement speed
        BNE    incrand      ; if timer is not up, restart
                           ; else, timer is up, move the snake
        MOVE.B DIRECTION, LAST_DIR
        CMP.B #DIR_UP, DIRECTION
        BEQ    mv_up

        CMP.B #DIR_DOWN, DIRECTION
        BEQ    mv_down

        CMP.B #DIR_LEFT, DIRECTION
        BEQ    mv_left

        CMP.B #DIR_RIGHT, DIRECTION
        BEQ    mv_right

mv_up   
        SUBI.B #1, POS_Y ; move snake up
        MOVE.L #0, TIMER ; reset timer
        BRA draw_snk
mv_down 
        ADDI.B #1, POS_Y ; move snake down
        MOVE.L #0, TIMER ; reset timer
        BRA draw_snk
mv_left 
        SUBI.B #1, POS_X ; move snake left
        MOVE.L #0, TIMER ; reset timer
        BRA draw_snk
mv_right
        ADDI.B #1, POS_X ; move snake right
        MOVE.L #0, TIMER ; reset timer
        BRA draw_snk
                        
draw_snk
        CMP.B  #$FF,POS_X  ; check if we have colided with the wall
        BEQ    gameover
        CMP.B  BOARD_COLS,POS_X
        BEQ    gameover
        CMP.B  #$FF,POS_Y
        BEQ    gameover
        CMP.B  BOARD_ROWS,POS_Y
        BEQ    gameover

        BSR _DECAYSNK    ; decay snake
        BSR _SYNC_VIEWPORT
        CMP.B #0,D0
        BEQ    draw_snk_visible
        BSR _REDRAW_VIEWPORT
draw_snk_visible
        BSR _DRAWSNK     ; draw new snake location


        CMP.B  #0, FOOD_AVAIL  
        BEQ    setfood          ; if not, set food in free spot
incrand
        BSR    _INCRAND     ; inc random x,y
        BRA    start  ; While game is in session
setfood     
        BSR    _DRAWFOOD          

        CMP.B   #$0A,FOOD_NUM  ;check what the food number is
        BNE     start          ;if less than 9, continue as normal
                               ;else player just leveled up
        MOVE.B  #0,FOOD_NUM    ;reset food num
        ADDI.B  #1,LEVEL       ;increase level
        BRA     loadlevel      ;load new level


gameover 
        CMP.B   #0,LIVES       ;check to see if we have any lives left
        BEQ     gameoverscr    ;if not, goto game over screen
        SUBI.B  #1,LIVES       ;else, subtract 1 from lives and restart current level
        BRA     loadlevel

gameoverscr
        MOVE.B  #GAME_MODE_GAMEOVER,GAME_MODE
        MOVE #STR_GAME_OVER_SCR,A1 
        BSR _DISPSTR         
        BSR _SELECT_GAMEOVER ; game over menu
        BRA intro  ; loop to start if user selected play again  
        
gamecompletescr
        MOVE.B  #GAME_MODE_GAMEOVER,GAME_MODE
        MOVE #STR_GAME_COMPLETE_SCR,A1 
        BSR _DISPSTR         
        TRAP #11        ; end game
        DC.W 0

  
; << End of Main >>


*************************************************************** 
; Function _INCRND
; Purpose  Increment Random X,Y position
***************************************************************

_INCRAND
        ADDI.W  #1,RAND_MEM
        CMP.W   BOARD_SIZE,RAND_MEM
        BNE     incdone
        MOVE.W  #$0,RAND_MEM

incdone
        RTS

*************************************************************** 
; Function _DRAWFOOD
; Purpose  Draw new food segment on the screen and in memory
***************************************************************

_DRAWFOOD
        MOVEM.L D0-D3/A0-A1,-(SP)        
        MOVE.L  #SNK_SCR,A0  ; load base address
        
findfoodspot
        BSR     _INCRAND
        MOVE.W  RAND_MEM,D2  
        MOVE.W  RAND_MEM,D0  
        MULU    #2,D0     
        CMP.W   #0,$00(A0,D0.W) ; check to see if this spot is clear
        BNE     findfoodspot    ; if not, find a new spot
        
        CLR.L   D3
        MOVE.B  BOARD_COLS,D3
        DIVU    D3,D2     ; y = offset/x_max
        MOVE.L  D2,D1           ; x = remainder
        LSR.L   #8,D1
        LSR.L   #8,D1

        BSR _DRAW_FOOD_WORLD


        BSR _MARKFOOD        ; mark current position in memory
        MOVE.B #1,FOOD_AVAIL ; indicate food is set
        MOVEM.L	(SP)+,D0-D3/A0-A1
        RTS

*************************************************************** 
; Function _DRAWSNK
; Purpose  Draw new snake segment on the screen and in memory
***************************************************************

_DRAWSNK
        MOVEM.L D0-D1/A1,-(SP)
        MOVE.B POS_X,D1 
        MOVE.B POS_Y,D2
        BSR _DRAW_SNAKE_WORLD
        BSR _MARKSNK        ; mark current position in memory
        MOVEM.L	(SP)+,D0-D1/A1
        RTS

*************************************************************** 
; Function _CLRSNK
; Purpose  Clear snake segment on the screen 
***************************************************************

_CLRSNK
        MOVEM.L D0-D3,-(SP)
        BSR _CLEAR_WORLD_CELL
        MOVEM.L	(SP)+,D0-D3
        RTS

*************************************************************** 
; Function _MARKFOOD
; Purpose  Marks food position in memory
***************************************************************

_MARKFOOD
        MOVEM.L D0/A0,-(SP)
        MOVE.L #SNK_SCR,A0  ; load base address
        MOVE.W  RAND_MEM,D0     ; load random memory offset        
        MULU    #2,D0    ; x2 for word size 

        MOVE.W  #FOOD_LIFE,$00(A0,D0.W) ; mark spot = base+offset <- food
        MOVEM.L (SP)+,D0/A0
        RTS

*************************************************************** 
; Function _MARKSNK
; Purpose  Marks snake position in memory
;          memory location = base + x + (y*78)
;          memory location = SNK_SCR + POS_X + (POS_Y*78)
***************************************************************

_MARKSNK 
        MOVEM.L D0-D3/A0,-(SP)
        MOVE.L #SNK_SCR,A0 ; load base address
        CLR.L     D0
        CLR.L     D1

        MOVE.B  POS_Y,D0   
        CLR.L   D3
        MOVE.B  BOARD_COLS,D3
        MULU    D3,D0     ; offset = y*cols

        MOVE.B  POS_X,D1   
        ADD.W   D1,D0      ; offset = offset + x
        MULU    #2,D0     ; x2 for word size

        MOVE.W  $00(A0,D0.W),D2
        CMP.W   #FOOD_LIFE,D2    ; check if we're moving onto food
        BEQ     markfood         ; if not set, snake segement life
        CMP.W   #0,D2            ; check if we're moving onto snake tail or a wall
        BEQ     marksnk          ; if not, mark snake here
        BRA     gameover         ; else, we ran into tail. game over


markfood
        ADDI.B  #FOOD_GROWTH,DELAY_DECAY    ; else delay snake decay by DELAY_DECAY (aka eaten food)   
        ADDI.B  #1,SCORE 
        ADD.B   #1,FOOD_NUM      ; add one to food number       
        
        MOVE.B  #0,FOOD_AVAIL     ; set no food available
        BSR     _DRAW_HUD   ; update score and HUD values
        
marksnk
        CMP.B   #0,DELAY_DECAY   ; check to see if snake is growing
        BEQ     marknog          ; if not, set normal life 
        ADD.W   #1,SNK_LIFE
        MOVE.W  SNK_LIFE,D1  ; add 1 to snake life

        MOVE.W  D1,$00(A0,D0.W) ; mark spot = base+offset <- snake life
        MOVEM.L (SP)+,D0-D3/A0
        RTS

marknog MOVE.W  SNK_LIFE,$00(A0,D0.W) ; mark spot = base+offset <- snake life
        MOVEM.L (SP)+,D0-D3/A0
        RTS
   
*************************************************************** 
; Function _DECAYSNK
; Purpose  Decay entire snake in memory
***************************************************************

_DECAYSNK 
        MOVEM.L D0-D5/A0,-(SP)

        CMP.B   #0,DELAY_DECAY  ; Check if snake is growing
        BNE     decaydelay      ; if so, don't decay

        MOVE.L  #SNK_SCR,A0 ; load base address
        CLR.L     D0
        CLR.L     D1

        MOVE.L  #0,D1  ; current x (relative memory array)
        MOVE.L  #0,D2  ; current y (relative memory array)

nextseg
        MOVE.L  D2,D0    ; y -> d0
        CLR.L   D3
        MOVE.B  BOARD_COLS,D3
        MULU    D3,D0  ; offset = y*cols
        ADD.W   D1,D0    ; offset = offset + x          

        MOVE.W  D0,D5    ; calc mem location
        MULU    #2,D5    ; x2 for word size

        CMP.W   BOARD_SIZE,D0  ; check to see if we're done 
        BNE     checkseg
        BRA     decaydelay

checkseg
        MOVE.W  $00(A0,D5.W),D4  ; move current life of segment x,y into D4
        CMP.W   #FOOD_LIFE,D4  ; check if food exists here
        BEQ     incseg  ; it does, don't decay it
        CMP.W   #WALL_LIFE,D4
        BEQ     incseg

        CMP.W   #0,D4    ; if snake segment exists here
        BNE     decayseg    ; decay segment here
        BRA     incseg      ; else no segment here, jump to inc segment code

decayseg         
        SUBI.W  #1,D4   ; Decay snake life by 1    
        MOVE.W  D4,$00(A0,D5.W) ; Update segment in memory
        CMP.W   #0,D4   ; check if life turned to 0
        BNE     incseg   ; if not 0 our segment still alive, jump to inc segment code
        BSR     _CLRSNK     ; else segment just died, update the screen (delete segment)


incseg  
        ADDI.B  #1,D1   ; add 1 to x
        CMP.B   BOARD_COLS,D1  ; check to see if x is greater than max length
        BEQ     incy
        BRA     nextseg    ; if not start checking next segment
incy    MOVE.B  #0,D1   ; x = 1
        ADDI.B  #1,D2   ; add 1 to y
        BRA     nextseg    ; check next segment


decaydelay
        CMP.B   #0,DELAY_DECAY  
        BEQ     donedecay
        SUBI.B  #1,DELAY_DECAY
        CMP.B   #0,DELAY_DECAY  ; we have just ended a decay period
        BNE     donedecay
        
donedecay
        MOVEM.L (SP)+,D0-D5/A0
        RTS


*************************************************************** 
; Function _LOADMEM
; Purpose  Clear a bitmap to the snake space in memory (load level)
; Param    A2 - Bitmap in memory
***************************************************************

_LOADMEM
        MOVEM.L D0-D2/A0,-(SP)
        MOVE.L  #0,D0
        MOVE.L  #SNK_SCR,A0 ; load base address
loadnextmem
        MOVE.W  D0,D1
        MULU    #2,D1    ; x2 for word size
        MOVE.B  $00(A2,D0.W),D2
        CMP.B   #'w',D2      ;check if segment is a wall
        BEQ     loadwallseg       
        BRA     loadinc 
loadwallseg
        MOVE.W  #WALL_LIFE,$00(A0,D1.W)  ; move current life of segment x,y into D4
        BRA     loadinc

loadinc
        ADDI.W  #1,D0       
        CMP.W   #SNK_SCR_SIZE,D0
        BNE     loadnextmem  
      
        MOVEM.L (SP)+,D0-D2/A0
        RTS

*************************************************************** 
; Function _CLEARMEM
; Purpose  Clear entire snake space in memory
***************************************************************

_CLEARMEM
        MOVEM.L D0-D1/A0,-(SP)
        MOVE.L  #0,D0
        MOVE.L  #SNK_SCR,A0 ; load base address
clearnextmem
        MOVE.W    D0,D1
        MULU    #2,D1    ; x2 for word size
        MOVE.W  #$0000,$00(A0,D1.W)  ; move current life of segment x,y into D4

        ADDI.W  #1,D0
        CMP.W   BOARD_SIZE,D0
        BNE     clearnextmem  
      
        MOVEM.L (SP)+,D0-D1/A0
        RTS

***************************************************************
; Function _DRAW_ARENA_SCREEN
; Purpose  Clear the gameplay surface before repainting the arena
***************************************************************

_DRAW_ARENA_SCREEN
        MOVEA.L #STR_CLS,A1
        BSR _DISPSTR
        RTS

***************************************************************
; Function _CONFIGURE_GAMEPLAY_VIEW
; Purpose  Size the visible gameplay viewport from terminal geometry
***************************************************************

_CONFIGURE_GAMEPLAY_VIEW
        MOVE.B TERM_COLS,D0
        CMP.B  #MAX_ARENA_X,D0
        BLE    config_view_cols_ready
        MOVE.B #MAX_ARENA_X,D0
config_view_cols_ready
        MOVE.B D0,VIEWPORT_COLS
        MOVE.B D0,BOARD_COLS
        MOVE.B TERM_ROWS,D0
        SUBI.B #1,D0
        CMP.B  #MAX_ARENA_ROWS,D0
        BLE    config_view_rows_ready
        MOVE.B #MAX_ARENA_ROWS,D0
config_view_rows_ready
        MOVE.B D0,VIEWPORT_ROWS
        MOVE.B D0,BOARD_ROWS
        MOVE.B #1,VIEWPORT_SCREEN_Y
        BSR    _UPDATE_BOARD_SIZE
        RTS

***************************************************************
; Function _UPDATE_BOARD_SIZE
***************************************************************

_UPDATE_BOARD_SIZE
        MOVEM.L D0-D1,-(SP)
        CLR.L   D0
        CLR.L   D1
        MOVE.B  BOARD_ROWS,D0
        MOVE.B  BOARD_COLS,D1
        MULU    D1,D0
        MOVE.W  D0,BOARD_SIZE
        MOVEM.L (SP)+,D0-D1
        RTS

***************************************************************
; Function _LOCK_VIEWPORT_ORIGIN
***************************************************************

_LOCK_VIEWPORT_ORIGIN
        CLR.B  VIEWPORT_ORIGIN_X
        CLR.B  VIEWPORT_ORIGIN_Y
        RTS

***************************************************************
; Function _SET_START_POSITION
***************************************************************

_SET_START_POSITION
        MOVE.B BOARD_COLS,D0
        LSR.B  #1,D0
        MOVE.B D0,POS_X
        MOVE.B BOARD_ROWS,D0
        LSR.B  #1,D0
        MOVE.B D0,POS_Y
        RTS

***************************************************************
; Function _SYNC_VIEWPORT
; Purpose  Fixed arena path for the current gameplay layout
; Returns  D0 = 0 because viewport origin stays stable during play
***************************************************************

_SYNC_VIEWPORT
        CLR.B  D0
        RTS

***************************************************************
; Function _WORLD_TO_SCREEN
; Purpose  Translate world coordinates into the current viewport
; Returns  D0 = 1 when visible, D1/D2 rewritten to screen coordinates
***************************************************************

_WORLD_TO_SCREEN
        MOVEM.L D3-D4,-(SP)
        CMP.B  VIEWPORT_ORIGIN_X,D1
        BLT    world_to_screen_hidden
        MOVE.B D1,D3
        SUB.B  VIEWPORT_ORIGIN_X,D3
        CMP.B  VIEWPORT_COLS,D3
        BGE    world_to_screen_hidden
        CMP.B  VIEWPORT_ORIGIN_Y,D2
        BLT    world_to_screen_hidden
        MOVE.B D2,D4
        SUB.B  VIEWPORT_ORIGIN_Y,D4
        CMP.B  VIEWPORT_ROWS,D4
        BGE    world_to_screen_hidden
        ADDI.B #1,D3
        ADD.B  VIEWPORT_SCREEN_Y,D4
        MOVE.B D3,D1
        MOVE.B D4,D2
        MOVE.B #1,D0
        BRA    world_to_screen_done
world_to_screen_hidden
        CLR.B  D0
world_to_screen_done
        MOVEM.L (SP)+,D3-D4
        RTS

***************************************************************
; Function _DRAW_WALL_WORLD
***************************************************************

_DRAW_WALL_WORLD
        MOVEM.L D1-D4/A1,-(SP)
        MOVE.B D1,D3
        MOVE.B D2,D4
        BSR _WORLD_TO_SCREEN
        CMP.B  #0,D0
        BEQ    draw_wall_world_done
        BSR _GOTOXY
        MOVE.L #STR_COL_WALL,A1
        BSR _DISPSTR
        MOVE.B #WALL_CHAR_VERTICAL,D0
        CMP.B  #0,D4
        BEQ    draw_wall_world_top
        MOVE.B BOARD_ROWS,D2
        SUBI.B #1,D2
        CMP.B  D2,D4
        BEQ    draw_wall_world_bottom
        BRA    draw_wall_world_emit
draw_wall_world_top
        MOVE.B #WALL_CHAR_HORIZONTAL,D0
        CMP.B  #0,D3
        BEQ    draw_wall_world_top_left
        MOVE.B BOARD_COLS,D2
        SUBI.B #1,D2
        CMP.B  D2,D3
        BEQ    draw_wall_world_top_right
        BRA    draw_wall_world_emit
draw_wall_world_top_left
        MOVE.B #WALL_CHAR_TOP_LEFT,D0
        BRA    draw_wall_world_emit
draw_wall_world_top_right
        MOVE.B #WALL_CHAR_TOP_RIGHT,D0
        BRA    draw_wall_world_emit
draw_wall_world_bottom
        MOVE.B #WALL_CHAR_HORIZONTAL,D0
        CMP.B  #0,D3
        BEQ    draw_wall_world_bottom_left
        MOVE.B BOARD_COLS,D2
        SUBI.B #1,D2
        CMP.B  D2,D3
        BEQ    draw_wall_world_bottom_right
        BRA    draw_wall_world_emit
draw_wall_world_bottom_left
        MOVE.B #WALL_CHAR_BOTTOM_LEFT,D0
        BRA    draw_wall_world_emit
draw_wall_world_bottom_right
        MOVE.B #WALL_CHAR_BOTTOM_RIGHT,D0
draw_wall_world_emit
        BSR _SPUTCH
draw_wall_world_done
        MOVEM.L (SP)+,D1-D4/A1
        RTS

***************************************************************
; Function _DRAW_FOOD_WORLD
***************************************************************

_DRAW_FOOD_WORLD
        MOVEM.L D1-D2/A1,-(SP)
        BSR _WORLD_TO_SCREEN
        CMP.B  #0,D0
        BEQ    draw_food_world_done
        BSR _GOTOXY
        MOVE.L #STR_COL_YELLOW,A1
        BSR _DISPSTR
        MOVE.B FOOD_NUM,D0
        ADDI.B #$30,D0
        BSR _SPUTCH
draw_food_world_done
        MOVEM.L (SP)+,D1-D2/A1
        RTS

***************************************************************
; Function _DRAW_SNAKE_WORLD
***************************************************************

_DRAW_SNAKE_WORLD
        MOVEM.L D1-D2/A1,-(SP)
        BSR _WORLD_TO_SCREEN
        CMP.B  #0,D0
        BEQ    draw_snake_world_done
        BSR _GOTOXY
        MOVE.L #STR_SNK_SEG,A1
        BSR _DISPSTR
        MOVE.L #STR_REV,A1
        BSR _DISPSTR
draw_snake_world_done
        MOVEM.L (SP)+,D1-D2/A1
        RTS

***************************************************************
; Function _CLEAR_WORLD_CELL
***************************************************************

_CLEAR_WORLD_CELL
        MOVEM.L D1-D2,-(SP)
        BSR _WORLD_TO_SCREEN
        CMP.B  #0,D0
        BEQ    clear_world_cell_done
        BSR _GOTOXY
        MOVE.B #$20,D0
        BSR _SPUTCH
clear_world_cell_done
        MOVEM.L (SP)+,D1-D2
        RTS

***************************************************************
; Function _CLEAR_VIEWPORT
***************************************************************

_CLEAR_VIEWPORT
        MOVEM.L D1-D4/A1,-(SP)
        MOVEA.L #STR_COL_DEFAULT,A1
        BSR _DISPSTR
        CLR.B  D4
clear_viewport_row
        MOVE.B #1,D1
        MOVE.B VIEWPORT_SCREEN_Y,D2
        ADD.B  D4,D2
        BSR _GOTOXY
        MOVE.B VIEWPORT_COLS,D3
clear_viewport_col
        MOVE.B #$20,D0
        BSR _SPUTCH
        SUBI.B #1,D3
        BNE    clear_viewport_col
        ADDI.B #1,D4
        CMP.B  VIEWPORT_ROWS,D4
        BLT    clear_viewport_row
        MOVEM.L (SP)+,D1-D4/A1
        RTS

***************************************************************
; Function _BUILD_MOBILE_BORDER_LEVEL
; Purpose  Create an empty arena with a one-cell perimeter wall
***************************************************************

_BUILD_MOBILE_BORDER_LEVEL
        MOVEM.L D0-D5/A0,-(SP)
        MOVE.L  #SNK_SCR,A0
        CLR.W   D0
        CLR.B   D1
        CLR.B   D2
build_mobile_level_next
        CMP.W   BOARD_SIZE,D0
        BEQ     build_mobile_level_done
        MOVE.W  D0,D5
        MULU    #2,D5
        CMP.B   #0,D1
        BEQ     build_mobile_level_wall
        MOVE.B  BOARD_COLS,D3
        SUBI.B  #1,D3
        CMP.B   D3,D1
        BEQ     build_mobile_level_wall
        CMP.B   #0,D2
        BEQ     build_mobile_level_wall
        MOVE.B  BOARD_ROWS,D4
        SUBI.B  #1,D4
        CMP.B   D4,D2
        BEQ     build_mobile_level_wall
        MOVE.W  #0,$00(A0,D5.W)
        BRA     build_mobile_level_inc
build_mobile_level_wall
        MOVE.W  #WALL_LIFE,$00(A0,D5.W)
build_mobile_level_inc
        ADDI.B  #1,D1
        CMP.B   BOARD_COLS,D1
        BLT     build_mobile_level_step
        MOVE.B  #0,D1
        ADDI.B  #1,D2
build_mobile_level_step
        ADDI.W  #1,D0
        BRA     build_mobile_level_next
build_mobile_level_done
        MOVEM.L (SP)+,D0-D5/A0
        RTS

***************************************************************
; Function _DRAW_MOBILE_BORDER_ARENA
; Purpose  Clear the viewport before repainting the border arena
***************************************************************

_DRAW_MOBILE_BORDER_ARENA
        MOVEM.L D0-D4/A1,-(SP)
        BSR _CLEAR_VIEWPORT

        MOVE.B #1,D1
        MOVE.B VIEWPORT_SCREEN_Y,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_WALL,A1
        BSR _DISPSTR
        MOVE.B #WALL_CHAR_TOP_LEFT,D0
        BSR _SPUTCH
        MOVE.B BOARD_COLS,D3
        SUBI.B #2,D3
draw_mobile_top_border
        CMP.B  #0,D3
        BEQ    draw_mobile_top_right
        MOVE.B #WALL_CHAR_HORIZONTAL,D0
        BSR _SPUTCH
        SUBI.B #1,D3
        BRA    draw_mobile_top_border
draw_mobile_top_right
        MOVE.B #WALL_CHAR_TOP_RIGHT,D0
        BSR _SPUTCH

        MOVE.B #1,D4
draw_mobile_side_rows
        MOVE.B BOARD_ROWS,D0
        SUBI.B #1,D0
        CMP.B  D0,D4
        BGE    draw_mobile_bottom_border
        MOVE.B #1,D1
        MOVE.B VIEWPORT_SCREEN_Y,D2
        ADD.B  D4,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_WALL,A1
        BSR _DISPSTR
        MOVE.B #WALL_CHAR_VERTICAL,D0
        BSR _SPUTCH
        MOVE.B BOARD_COLS,D1
        MOVE.B VIEWPORT_SCREEN_Y,D2
        ADD.B  D4,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_WALL,A1
        BSR _DISPSTR
        MOVE.B #WALL_CHAR_VERTICAL,D0
        BSR _SPUTCH
        ADDI.B #1,D4
        BRA    draw_mobile_side_rows

draw_mobile_bottom_border
        MOVE.B #1,D1
        MOVE.B VIEWPORT_SCREEN_Y,D2
        ADD.B  BOARD_ROWS,D2
        SUBI.B #1,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_WALL,A1
        BSR _DISPSTR
        MOVE.B #WALL_CHAR_BOTTOM_LEFT,D0
        BSR _SPUTCH
        MOVE.B BOARD_COLS,D3
        SUBI.B #2,D3
draw_mobile_bottom_border_loop
        CMP.B  #0,D3
        BEQ    draw_mobile_bottom_right
        MOVE.B #WALL_CHAR_HORIZONTAL,D0
        BSR _SPUTCH
        SUBI.B #1,D3
        BRA    draw_mobile_bottom_border_loop
draw_mobile_bottom_right
        MOVE.B #WALL_CHAR_BOTTOM_RIGHT,D0
        BSR _SPUTCH
        MOVEM.L (SP)+,D0-D4/A1
        RTS

***************************************************************
; Function _REDRAW_VIEWPORT
; Purpose  Repaint the visible game board from logical memory
***************************************************************

_REDRAW_VIEWPORT
        MOVEM.L D0-D5/A0,-(SP)
        MOVE.L #SNK_SCR,A0
        CLR.W  D0
        CLR.B  D1
        CLR.B  D2
redraw_viewport_next
        CMP.W  BOARD_SIZE,D0
        BEQ    redraw_viewport_done
        MOVE.W D0,D5
        MULU   #2,D5
        MOVE.W $00(A0,D5.W),D4
        CMP.W  #0,D4
        BEQ    redraw_viewport_inc
        CMP.W  #WALL_LIFE,D4
        BEQ    redraw_viewport_wall
        CMP.W  #FOOD_LIFE,D4
        BEQ    redraw_viewport_food
        BSR _DRAW_SNAKE_WORLD
        BRA    redraw_viewport_inc
redraw_viewport_wall
        BSR _DRAW_WALL_WORLD
        BRA    redraw_viewport_inc
redraw_viewport_food
        BSR _DRAW_FOOD_WORLD
redraw_viewport_inc
        ADDI.B #1,D1
        CMP.B  BOARD_COLS,D1
        BLT    redraw_viewport_step
        MOVE.B #0,D1
        ADDI.B #1,D2
redraw_viewport_step
        ADDI.W #1,D0
        BRA    redraw_viewport_next
redraw_viewport_done
        MOVEM.L (SP)+,D0-D5/A0
        RTS

***************************************************************
; Function _DRAW_HUD
; Purpose  Draw the current HUD values for the active layout
***************************************************************

_DRAW_HUD
        MOVEM.L D0-D4/A1,-(SP)
        BSR    _CLEAR_STATUS_ROW
        CMP.B  #LAYOUT_DESKTOP,LAYOUT_PROFILE
        BEQ    draw_hud_desktop
        CMP.B  #LAYOUT_MOBILE_LANDSCAPE,LAYOUT_PROFILE
        BEQ    draw_hud_landscape
        BRA    draw_hud_portrait
draw_hud_desktop
        MOVE.B #2,D1
        MOVE.B TERM_ROWS,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_CYAN,A1
        BSR _DISPSTR
        MOVEA.L #STR_HUD_SCORE_LABEL,A1
        BSR _DISPSTR
        MOVE.B #9,D1
        MOVE.B TERM_ROWS,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_GREEN,A1
        BSR _DISPSTR
        MOVE.B SCORE,D4
        BSR _DISPNUM10
        MOVE.B #18,D1
        MOVE.B TERM_ROWS,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_MAGENTA,A1
        BSR _DISPSTR
        MOVEA.L #STR_HUD_LIVES_LABEL,A1
        BSR _DISPSTR
        MOVE.B #25,D1
        MOVE.B TERM_ROWS,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_YELLOW,A1
        BSR _DISPSTR
        MOVE.B LIVES,D4
        BSR _DISPNUM10
        MOVE.B #34,D1
        MOVE.B TERM_ROWS,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_CYAN,A1
        BSR _DISPSTR
        MOVEA.L #STR_HUD_LEVEL_LABEL,A1
        BSR _DISPSTR
        MOVE.B #41,D1
        MOVE.B TERM_ROWS,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_GREEN,A1
        BSR _DISPSTR
        MOVE.B LEVEL,D4
        ADDI.B #1,D4
        BSR _DISPNUM10
        BRA    draw_hud_done
draw_hud_landscape
        MOVE.B #2,D1
        MOVE.B TERM_ROWS,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_CYAN,A1
        BSR _DISPSTR
        MOVEA.L #STR_HUD_SCORE_SHORT,A1
        BSR _DISPSTR
        MOVE.B #4,D1
        MOVE.B TERM_ROWS,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_GREEN,A1
        BSR _DISPSTR
        MOVE.B SCORE,D4
        BSR _DISPNUM10
        MOVE.B #7,D1
        MOVE.B TERM_ROWS,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_MAGENTA,A1
        BSR _DISPSTR
        MOVEA.L #STR_HUD_LIVES_SHORT,A1
        BSR _DISPSTR
        MOVE.B #9,D1
        MOVE.B TERM_ROWS,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_YELLOW,A1
        BSR _DISPSTR
        MOVE.B LIVES,D4
        BSR _DISPNUM10
        MOVE.B #12,D1
        MOVE.B TERM_ROWS,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_CYAN,A1
        BSR _DISPSTR
        MOVEA.L #STR_HUD_LEVEL_SHORT,A1
        BSR _DISPSTR
        MOVE.B #15,D1
        MOVE.B TERM_ROWS,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_GREEN,A1
        BSR _DISPSTR
        MOVE.B LEVEL,D4
        ADDI.B #1,D4
        BSR _DISPNUM10
        BRA    draw_hud_done
draw_hud_portrait
        MOVE.B #2,D1
        MOVE.B TERM_ROWS,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_CYAN,A1
        BSR _DISPSTR
        MOVEA.L #STR_HUD_SCORE_SHORT,A1
        BSR _DISPSTR
        MOVE.B #4,D1
        MOVE.B TERM_ROWS,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_GREEN,A1
        BSR _DISPSTR
        MOVE.B SCORE,D4
        BSR _DISPNUM10
        MOVE.B #7,D1
        MOVE.B TERM_ROWS,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_MAGENTA,A1
        BSR _DISPSTR
        MOVEA.L #STR_HUD_LIVES_SHORT,A1
        BSR _DISPSTR
        MOVE.B #9,D1
        MOVE.B TERM_ROWS,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_YELLOW,A1
        BSR _DISPSTR
        MOVE.B LIVES,D4
        BSR _DISPNUM10
        MOVE.B #12,D1
        MOVE.B TERM_ROWS,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_CYAN,A1
        BSR _DISPSTR
        MOVEA.L #STR_HUD_LEVEL_SHORT,A1
        BSR _DISPSTR
        MOVE.B #15,D1
        MOVE.B TERM_ROWS,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_GREEN,A1
        BSR _DISPSTR
        MOVE.B LEVEL,D4
        ADDI.B #1,D4
        BSR _DISPNUM10
draw_hud_done
        MOVEM.L (SP)+,D0-D4/A1
        RTS

***************************************************************
; Function _CLEAR_STATUS_ROW
***************************************************************

_CLEAR_STATUS_ROW
        MOVEM.L D0-D3/A1,-(SP)
        MOVE.B #1,D1
        MOVE.B TERM_ROWS,D2
        BSR _GOTOXY
        MOVEA.L #STR_COL_DEFAULT,A1
        BSR _DISPSTR
        MOVE.B TERM_COLS,D3
clear_status_row_loop
        MOVE.B #$20,D0
        BSR _SPUTCH
        SUBI.B #1,D3
        BNE    clear_status_row_loop
        MOVEM.L (SP)+,D0-D3/A1
        RTS

        
*************************************************************** 
; Function _DISPSCORE
; Purpose  Display a score to the screen
***************************************************************


_DISPSCORE       
        MOVEM.L D0-D4/A1,-(SP)

        MOVE    #19,D1    ; x Goto score value on the screen
        MOVE    #24,D2    ; y
        BSR     _GOTOXY
        MOVE.L #STR_COL_YELLOW,A1 
        BSR _DISPSTR          

        MOVE.B SCORE,D4
        BSR    _DISPNUM10


        MOVEM.L (SP)+,D0-D4/A1
        RTS        

*************************************************************** 
; Function _DISPNUM10
; Purpose  Display a number to the screen in BASE 10
***************************************************************

_DISPNUM10
        MOVEM.L D0-D4/A1,-(SP)
        CLR.B   D3        
        CMP.B   #0,D4     ; if it's zero to start with, we don't need to count
        BEQ     scoreskipten

scorecnt                     ; count by 10 algorithm
        ADDI.B  #1,D3        ; add 1 to base 10 counter
        SUBI.B  #1,D4        ; decrement actual counter
        MOVE.B  D3,D0        
        ANDI.B  #$0F,D0      ; check if we have 10 in 1's column
        CMP.B   #$0A,D0
        BEQ     scoreaddten   ; if so, add 1 to 10's column, clear 1's 
        BRA     scoredonecnt  ; else see if we're done

scoreaddten
        ADDI.B  #$10,D3      ; Add 1 to tens
        ANDI.B  #$F0,D3      ; Clears ones

scoredonecnt
        CMP.B   #0,D4        ; if not done,
        BNE     scorecnt      ; start count algoritm again
        
        MOVE.B  D3,D0        ; display 10's digit
        LSR.B   #4,D0          
        CMP.B   #$0,D0       ; if 10's digit is a 0, don't output it
        BEQ     scoreskipten

        ADDI.B  #$30,D0
        BSR     _SPUTCH

scoreskipten
        MOVE.B  D3,D0        ; display 1's digit
        ANDI    #$0F,D0
        ADDI.B  #$30,D0
        BSR     _SPUTCH
        
        MOVEM.L (SP)+,D0-D4/A1
        RTS


*************************************************************** 
; Function _DISPSTR
; Purpose  Display a string in memory to the screen
***************************************************************


_DISPSTR
        MOVEM.L D0,-(SP)
nextch  
        MOVE.B  (A1)+,D0 ; get character from pointer
        CMP.B #$0,D0    ; see if it's null
        BEQ donech       ; if so, we're done
        BSR _SPUTCH      ; else display it
        BRA nextch
donech  
        MOVEM.L (SP)+,D0
        RTS

***************************************************************
; Function _GOTOXY
; Purpose  Goto position on the screen specified by D1(x),D2(y)
***************************************************************

_GOTOXY 
        MOVEM.L D0-D4,-(SP)
        
        MOVE.B  D2,D4   ; setup y for count
        CLR.W   D3

        MOVEA.L #STR_ESC,A1 
        BSR     _DISPSTR     ; send ANSI escape sequence

        BRA     gotocnt
gotocnty
        MOVE.B  #$FF,D2
        MOVE.B  D1,D4   ; setup x for count
        CLR.W   D3

        MOVE.B  #';',D0
        BSR     _SPUTCH
 
gotocnt                      ; count by 10 algorithm
        ADDI.B  #1,D3        ; add 1 to base 10 counter
        SUBI.B  #1,D4        ; decrement actual counter
        MOVE.B  D3,D0        
        ANDI.B  #$0F,D0      ; check if we have 10 in 1's column
        CMP.B   #$0A,D0
        BEQ     gotoaddten   ; if so, add 1 to 10's column, clear 1's 
        BRA     gotodonecnt  ; else see if we're done

gotoaddten
        ADDI.B  #$10,D3      ; Add 1 to tens
        ANDI.B  #$F0,D3      ; Clears ones

gotodonecnt
        CMP.B   #0,D4        ; if not done,
        BNE     gotocnt      ; start count algoritm again
        
        MOVE.B  D3,D0        ; display 10's digit
        LSR.B   #4,D0          
        CMP     #$0,D0       ; if 10's digit is a 0, don't output it
        BEQ     gotoskipten

        ADDI.B  #$30,D0
        BSR     _SPUTCH

gotoskipten
        MOVE.B  D3,D0        ; display 1's digit
        ANDI    #$0F,D0
        ADDI.B  #$30,D0
        BSR     _SPUTCH

        CMP.B   #$FF,D2      ; check to see if we already counted Y
        BNE     gotocnty     ; if not, start counting


        MOVE.B  #'H',D0      ; Finish ANSI control in form <ESC>[Yn:XnH
        BSR     _SPUTCH

        MOVEM.L	(SP)+,D0-D4
        RTS    

***************************************************************
; Function _INIT_LAYOUT
; Purpose  Refresh terminal geometry-derived layout state
***************************************************************

_INIT_LAYOUT
        CMP.B  #LAYOUT_PROFILE_UNKNOWN,LAYOUT_PROFILE
        BNE    init_layout_ready
        BSR    _SELECT_LAYOUT_PROFILE
init_layout_ready
        CLR.B TOUCH_PENDING
        CLR.B TOUCH_PHASE
        CLR.B TOUCH_ROW
        CLR.B TOUCH_COL
        CLR.B TOUCH_FLAGS
        CLR.B TOUCH_CONFIRM_PENDING
        RTS

***************************************************************
; Function _SELECT_LAYOUT_PROFILE
; Purpose  Pick a layout profile from TERM_COLS and TERM_ROWS
***************************************************************

_SELECT_LAYOUT_PROFILE
        MOVE.B #LAYOUT_MOBILE_PORTRAIT,LAYOUT_PROFILE
        MOVE.B TERM_COLS,D0
        MOVE.B TERM_ROWS,D1
        CMP.B  #52,D0
        BLT    layout_profile_done
        CMP.B  #11,D1
        BLT    layout_profile_done
        MOVE.B #LAYOUT_MOBILE_LANDSCAPE,LAYOUT_PROFILE
        CMP.B  #78,D0
        BLT    layout_profile_done
        CMP.B  #24,D1
        BLT    layout_profile_done
        MOVE.B #LAYOUT_DESKTOP,LAYOUT_PROFILE
layout_profile_done
        RTS

***************************************************************
; Function _DRAW_INTRO_SCREEN
; Purpose  Draw a profile-aware intro screen
***************************************************************

_DRAW_SCREEN_BORDER
        MOVEM.L D0-D4/A1,-(SP)
        MOVE.B TERM_COLS,D3
        CMP.B  #2,D3
        BLT    draw_screen_border_done
        MOVE.B TERM_ROWS,D4
        CMP.B  #2,D4
        BLT    draw_screen_border_done

        MOVE.B #1,D1
        MOVE.B #1,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_WALL,A1
        BSR _DISPSTR
        MOVE.B #WALL_CHAR_TOP_LEFT,D0
        BSR _SPUTCH
        MOVE.B D3,D1
        SUBI.B #2,D1
draw_screen_border_top
        CMP.B  #0,D1
        BEQ    draw_screen_border_top_right
        MOVE.B #WALL_CHAR_HORIZONTAL,D0
        BSR _SPUTCH
        SUBI.B #1,D1
        BRA    draw_screen_border_top
draw_screen_border_top_right
        MOVE.B #WALL_CHAR_TOP_RIGHT,D0
        BSR _SPUTCH

        MOVE.B #2,D0
draw_screen_border_sides
        MOVE.B D4,D1
        SUBI.B #1,D1
        CMP.B  D1,D0
        BGE    draw_screen_border_bottom
        MOVE.B #1,D1
        MOVE.B D0,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_WALL,A1
        BSR _DISPSTR
        MOVE.B #WALL_CHAR_VERTICAL,D0
        BSR _SPUTCH
        MOVE.B D3,D1
        BSR _GOTOXY
        MOVE.L #STR_COL_WALL,A1
        BSR _DISPSTR
        MOVE.B #WALL_CHAR_VERTICAL,D0
        BSR _SPUTCH
        MOVE.B D2,D0
        ADDI.B #1,D0
        BRA    draw_screen_border_sides

draw_screen_border_bottom
        MOVE.B #1,D1
        MOVE.B D4,D2
        BSR _GOTOXY
        MOVE.L #STR_COL_WALL,A1
        BSR _DISPSTR
        MOVE.B #WALL_CHAR_BOTTOM_LEFT,D0
        BSR _SPUTCH
        MOVE.B D3,D1
        SUBI.B #2,D1
draw_screen_border_bottom_loop
        CMP.B  #0,D1
        BEQ    draw_screen_border_bottom_right
        MOVE.B #WALL_CHAR_HORIZONTAL,D0
        BSR _SPUTCH
        SUBI.B #1,D1
        BRA    draw_screen_border_bottom_loop
draw_screen_border_bottom_right
        MOVE.B #WALL_CHAR_BOTTOM_RIGHT,D0
        BSR _SPUTCH
draw_screen_border_done
        MOVEM.L (SP)+,D0-D4/A1
        RTS

***************************************************************
; Function _GET_CENTERED_X
; Purpose  Resolve a centered x-origin for a fixed-width string
; Input    D0 = printable width
; Returns  D1 = centered x column
***************************************************************

_GET_CENTERED_X
        MOVE.B #2,D1
        MOVE.B TERM_COLS,D3
        CMP.B  D0,D3
        BLE    get_centered_x_done
        SUB.B  D0,D3
        LSR.B  #1,D3
        ADDI.B #1,D3
        CMP.B  #2,D3
        BLT    get_centered_x_done
        MOVE.B D3,D1
get_centered_x_done
        RTS

***************************************************************
; Function _DRAW_CENTERED_LINE
; Purpose  Draw a centered line at a specific row
; Input    D0 = printable width, D2 = row, A1 = string
***************************************************************

_DRAW_CENTERED_LINE
        MOVE.L A1,-(SP)
        BSR    _GET_CENTERED_X
        BSR    _GOTOXY
        MOVEA.L (SP)+,A1
        BSR    _DISPSTR
        RTS

***************************************************************
; Function _DRAW_DESKTOP_INTRO
; Purpose  Draw the centered desktop intro copy
***************************************************************

_DRAW_DESKTOP_INTRO
        MOVE.B #7,D0
        MOVE.B #3,D2
        MOVEA.L #STR_INTRO_TITLE,A1
        BSR    _DRAW_CENTERED_LINE

        MOVE.B #19,D0
        MOVE.B #4,D2
        MOVEA.L #STR_INTRO_SUBTITLE,A1
        BSR    _DRAW_CENTERED_LINE

        MOVE.B #32,D0
        MOVE.B #6,D2
        MOVEA.L #STR_INTRO_TOUCH_HINT,A1
        BSR    _DRAW_CENTERED_LINE

        MOVE.B #17,D0
        MOVE.B #8,D2
        MOVEA.L #STR_INTRO_SELECT_LABEL,A1
        BSR    _DRAW_CENTERED_LINE

        MOVE.B #22,D0
        MOVE.B TERM_ROWS,D2
        SUBI.B #4,D2
        MOVEA.L #STR_INTRO_MOVE_HINT,A1
        BSR    _DRAW_CENTERED_LINE

        MOVE.B #10,D0
        MOVE.B TERM_ROWS,D2
        SUBI.B #3,D2
        MOVEA.L #STR_INTRO_SITE,A1
        BSR    _DRAW_CENTERED_LINE

        MOVE.B #14,D0
        MOVE.B TERM_ROWS,D2
        SUBI.B #2,D2
        MOVEA.L #STR_INTRO_AUTHOR,A1
        BSR    _DRAW_CENTERED_LINE
        RTS

***************************************************************
; Function _DRAW_LANDSCAPE_INTRO
; Purpose  Draw the centered mobile landscape intro copy
***************************************************************

_DRAW_LANDSCAPE_INTRO
        MOVE.B #7,D0
        MOVE.B #2,D2
        MOVEA.L #STR_INTRO_TITLE,A1
        BSR    _DRAW_CENTERED_LINE

        MOVE.B #19,D0
        MOVE.B #3,D2
        MOVEA.L #STR_INTRO_SUBTITLE,A1
        BSR    _DRAW_CENTERED_LINE

        MOVE.B #17,D0
        MOVE.B #4,D2
        MOVEA.L #STR_INTRO_SELECT_LABEL,A1
        BSR    _DRAW_CENTERED_LINE
        RTS

***************************************************************
; Function _DRAW_PORTRAIT_INTRO
; Purpose  Draw the centered mobile portrait intro copy
***************************************************************

_DRAW_PORTRAIT_INTRO
        MOVE.B #7,D0
        MOVE.B #3,D2
        MOVEA.L #STR_INTRO_TITLE,A1
        BSR    _DRAW_CENTERED_LINE

        MOVE.B #12,D0
        MOVE.B #4,D2
        MOVEA.L #STR_INTRO_SUBTITLE_SHORT,A1
        BSR    _DRAW_CENTERED_LINE

        MOVE.B #17,D0
        MOVE.B #5,D2
        MOVEA.L #STR_INTRO_SELECT_LABEL,A1
        BSR    _DRAW_CENTERED_LINE

        MOVE.B #14,D0
        MOVE.B #6,D2
        MOVEA.L #STR_INTRO_TAP_DIFFICULTY,A1
        BSR    _DRAW_CENTERED_LINE

        MOVE.B #16,D0
        MOVE.B #7,D2
        MOVEA.L #STR_INTRO_KEYS_HINT,A1
        BSR    _DRAW_CENTERED_LINE
        RTS

_DRAW_INTRO_SCREEN
        MOVEA.L #STR_CLS,A1
        BSR _DISPSTR
        BSR _DRAW_SCREEN_BORDER
        CMP.B #LAYOUT_MOBILE_LANDSCAPE,LAYOUT_PROFILE
        BEQ    draw_intro_landscape
        CMP.B #LAYOUT_MOBILE_PORTRAIT,LAYOUT_PROFILE
        BEQ    draw_intro_portrait
        BSR    _DRAW_DESKTOP_INTRO
        RTS
draw_intro_landscape
        BSR    _DRAW_LANDSCAPE_INTRO
        RTS
draw_intro_portrait
        BSR    _DRAW_PORTRAIT_INTRO
        RTS

***************************************************************
; Function _GET_DIFF_LAYOUT
; Purpose  Get difficulty menu origin and row step
; Returns D1=x, D2=y, D3=row step
***************************************************************

_GET_DIFF_LAYOUT
        MOVE.B #8,D0
        BSR    _GET_CENTERED_X
        MOVE.B #11,D2
        MOVE.B #2,D3
        CMP.B  #LAYOUT_MOBILE_LANDSCAPE,LAYOUT_PROFILE
        BEQ    diff_layout_landscape
        CMP.B  #LAYOUT_MOBILE_PORTRAIT,LAYOUT_PROFILE
        BEQ    diff_layout_portrait
        RTS
diff_layout_landscape
        MOVE.B #8,D0
        BSR    _GET_CENTERED_X
        MOVE.B #6,D2
        MOVE.B #2,D3
        RTS
diff_layout_portrait
        MOVE.B #10,D2
        MOVE.B #8,D0
        BSR    _GET_CENTERED_X
        MOVE.B #3,D3
        RTS

***************************************************************
; Function _DRAW_MOBILE_DIFF_BOX
; Purpose  Draw a boxed mobile difficulty button group
***************************************************************

_DRAW_MOBILE_DIFF_BOX
        CMP.B  #LAYOUT_DESKTOP,LAYOUT_PROFILE
        BEQ    draw_mobile_diff_box_done
        MOVEM.L D0-D7/A1,-(SP)
        BSR    _GET_DIFF_LAYOUT

        MOVE.B D1,D4
        SUBI.B #3,D4
        MOVE.B D1,D5
        ADDI.B #10,D5
        MOVE.B D2,D6
        SUBI.B #1,D6
        MOVE.B D2,D7
        MOVE.B D3,D0
        ADD.B  D0,D7
        ADD.B  D0,D7
        ADD.B  D0,D7
        ADDI.B #1,D7

        MOVE.B D4,D1
        MOVE.B D6,D2
        BSR    _GOTOXY
        MOVEA.L #STR_COL_MAGENTA,A1
        BSR    _DISPSTR
        MOVE.B #WALL_CHAR_TOP_LEFT,D0
        BSR    _SPUTCH
        MOVE.B D5,D1
        SUB.B  D4,D1
        SUBI.B #1,D1
draw_mobile_diff_box_top
        CMP.B  #0,D1
        BEQ    draw_mobile_diff_box_top_right
        MOVE.B #WALL_CHAR_HORIZONTAL,D0
        BSR    _SPUTCH
        SUBI.B #1,D1
        BRA    draw_mobile_diff_box_top
draw_mobile_diff_box_top_right
        MOVE.B #WALL_CHAR_TOP_RIGHT,D0
        BSR    _SPUTCH

        MOVE.B D6,D0
        ADDI.B #1,D0
draw_mobile_diff_box_sides
        CMP.B  D7,D0
        BGE    draw_mobile_diff_box_bottom
        MOVE.B D4,D1
        MOVE.B D0,D2
        BSR    _GOTOXY
        MOVEA.L #STR_COL_MAGENTA,A1
        BSR    _DISPSTR
        MOVE.B #WALL_CHAR_VERTICAL,D0
        BSR    _SPUTCH
        MOVE.B D5,D1
        BSR    _GOTOXY
        MOVEA.L #STR_COL_MAGENTA,A1
        BSR    _DISPSTR
        MOVE.B #WALL_CHAR_VERTICAL,D0
        BSR    _SPUTCH
        MOVE.B D2,D0
        ADDI.B #1,D0
        BRA    draw_mobile_diff_box_sides

draw_mobile_diff_box_bottom
        MOVE.B D4,D1
        MOVE.B D7,D2
        BSR    _GOTOXY
        MOVEA.L #STR_COL_MAGENTA,A1
        BSR    _DISPSTR
        MOVE.B #WALL_CHAR_BOTTOM_LEFT,D0
        BSR    _SPUTCH
        MOVE.B D5,D1
        SUB.B  D4,D1
        SUBI.B #1,D1
draw_mobile_diff_box_bottom_loop
        CMP.B  #0,D1
        BEQ    draw_mobile_diff_box_bottom_right
        MOVE.B #WALL_CHAR_HORIZONTAL,D0
        BSR    _SPUTCH
        SUBI.B #1,D1
        BRA    draw_mobile_diff_box_bottom_loop
draw_mobile_diff_box_bottom_right
        MOVE.B #WALL_CHAR_BOTTOM_RIGHT,D0
        BSR    _SPUTCH
        MOVEA.L #STR_COL_DEFAULT,A1
        BSR    _DISPSTR
        MOVEM.L (SP)+,D0-D7/A1
draw_mobile_diff_box_done
        RTS

***************************************************************
; Function _APPLY_DIFFICULTY_SPEED
; Purpose  Sync SNK_SPEED with the selected difficulty
***************************************************************

_APPLY_DIFFICULTY_SPEED
        CMP.B  #0,DIFFICULTY
        BEQ    apply_diff_easy
        CMP.B  #1,DIFFICULTY
        BEQ    apply_diff_medium
        CMP.B  #2,DIFFICULTY
        BEQ    apply_diff_hard
        MOVE.L #SNK_SPEED_INSANE,SNK_SPEED
        RTS
apply_diff_easy
        MOVE.L #SNK_SPEED_EASY,SNK_SPEED
        RTS
apply_diff_medium
        MOVE.L #SNK_SPEED_MEDIUM,SNK_SPEED
        RTS
apply_diff_hard
        MOVE.L #SNK_SPEED_HARD,SNK_SPEED
        RTS

***************************************************************
; Function _HANDLE_INTRO_TOUCH
; Purpose  Map touch rows to large difficulty-row targets
***************************************************************

_HANDLE_INTRO_TOUCH
        BSR    _GET_DIFF_LAYOUT
        CMP.B  #LAYOUT_DESKTOP,LAYOUT_PROFILE
        BEQ    intro_touch_rows
        MOVE.B TOUCH_COL,D6
        MOVE.B D1,D0
        SUBI.B #3,D0
        CMP.B  D0,D6
        BLT    intro_touch_done
        MOVE.B D1,D0
        ADDI.B #10,D0
        CMP.B  D0,D6
        BGT    intro_touch_done
intro_touch_rows
        MOVE.B TOUCH_ROW,D4
        CMP.B  D2,D4
        BLT    intro_touch_done

        MOVE.B D2,D5
        ADD.B  D3,D5
        CMP.B  D5,D4
        BLT    intro_touch_easy

        ADD.B  D3,D5
        CMP.B  D5,D4
        BLT    intro_touch_medium

        ADD.B  D3,D5
        CMP.B  D5,D4
        BLT    intro_touch_hard

        ADD.B  D3,D5
        CMP.B  D5,D4
        BLT    intro_touch_insane
        RTS
intro_touch_easy
        MOVE.B #0,DIFFICULTY
        BRA    intro_touch_confirm
intro_touch_medium
        MOVE.B #1,DIFFICULTY
        BRA    intro_touch_confirm
intro_touch_hard
        MOVE.B #2,DIFFICULTY
        BRA    intro_touch_confirm
intro_touch_insane
        MOVE.B #3,DIFFICULTY
intro_touch_confirm
        BSR    _APPLY_DIFFICULTY_SPEED
        MOVE.B #1,TOUCH_CONFIRM_PENDING
intro_touch_done
        RTS

***************************************************************
; Function _HANDLE_PLAY_TOUCH
; Purpose  Convert touch direction into snake movement requests
***************************************************************

_HANDLE_PLAY_TOUCH
        MOVE.B TOUCH_COL,D0
        MOVE.B VIEWPORT_COLS,D1
        LSR.B  #1,D1
        SUB.B  D1,D0

        MOVE.B TOUCH_ROW,D2
        CMP.B  VIEWPORT_SCREEN_Y,D2
        BLT    play_touch_done
        SUB.B  VIEWPORT_SCREEN_Y,D2
        MOVE.B VIEWPORT_ROWS,D3
        LSR.B  #1,D3
        SUB.B  D3,D2

        MOVE.B D0,D4
        CMP.B  #0,D4
        BGE    play_touch_dx_abs_done
        NEG.B  D4
play_touch_dx_abs_done
        MOVE.B D2,D5
        CMP.B  #0,D5
        BGE    play_touch_dy_abs_done
        NEG.B  D5
play_touch_dy_abs_done
        CMP.B  #1,D4
        BGT    play_touch_pick_axis
        CMP.B  #1,D5
        BLE    play_touch_done
play_touch_pick_axis
        CMP.B  D5,D4
        BGE    play_touch_horizontal
        CMP.B  #0,D2
        BLT    play_touch_up
        BGT    play_touch_down
        RTS
play_touch_horizontal
        CMP.B  #0,D0
        BLT    play_touch_left
        BGT    play_touch_right
        RTS
play_touch_up
        BSR _REQUEST_DIR_UP
        RTS
play_touch_down
        BSR _REQUEST_DIR_DOWN
        RTS
play_touch_left
        BSR _REQUEST_DIR_LEFT
        RTS
play_touch_right
        BSR _REQUEST_DIR_RIGHT
play_touch_done
        RTS

***************************************************************
; Function TOUCH_ISR
; Purpose  Consume host-published touch mailbox events
***************************************************************

TOUCH_ISR
        MOVEM.L D0-D5/A0,-(SP)
        CMP.B  #0,TOUCH_PENDING
        BEQ    touch_isr_done
        CMP.B  #GAME_MODE_INTRO,GAME_MODE
        BEQ    touch_isr_intro
        CMP.B  #GAME_MODE_PLAY,GAME_MODE
        BEQ    touch_isr_play
        BRA    touch_isr_done
touch_isr_intro
        BSR    _HANDLE_INTRO_TOUCH
        BRA    touch_isr_finish
touch_isr_play
        BSR    _HANDLE_PLAY_TOUCH
touch_isr_finish
        CLR.B  TOUCH_PENDING
touch_isr_done
        MOVEM.L (SP)+,D0-D5/A0
        RTS

*************************************************************** 
; Function _SELECT_DIFF
; Purpose  Select Difficulty
***************************************************************

_SELECT_DIFF
        MOVEM.L D0-D3,-(SP)
        ; Select Difficulty
draw_select
        BSR      _GET_DIFF_LAYOUT
        BSR      _DRAW_MOBILE_DIFF_BOX
        CMP.B     #0,DIFFICULTY  ; 
        BEQ     draw_easy_select        
        CMP.B     #1,DIFFICULTY  ; 
        BEQ     draw_medium_select
        CMP.B     #2,DIFFICULTY  ; 
        BEQ     draw_hard_select
        CMP.B     #3,DIFFICULTY  ; 
        BEQ     draw_insane_select

draw_easy_select     ; Draw EASY selected
        MOVE.L  #SNK_SPEED_EASY,SNK_SPEED ; set snake speed for this option

        BSR      _GOTOXY
        MOVEA.L  #STR_SEASY,A1 ; draw selected
        BSR _DISPSTR
        ADD.B    D3,D2
        BSR      _GOTOXY
        MOVEA.L  #STR_MEDIUM,A1 ; draw unselected
        BSR _DISPSTR
        ADD.B    D3,D2
        BSR      _GOTOXY
        MOVEA.L  #STR_HARD,A1 ; draw unselected
        BSR _DISPSTR
        ADD.B    D3,D2
        BSR      _GOTOXY
        MOVEA.L  #STR_INSANE,A1 ; draw unselected
        BSR _DISPSTR
        BRA get_select
draw_medium_select
        MOVE.L  #SNK_SPEED_MEDIUM,SNK_SPEED ; set snake speed for this option

        BSR      _GOTOXY
        MOVEA.L  #STR_EASY,A1 
        BSR _DISPSTR
        ADD.B    D3,D2
        BSR      _GOTOXY
        MOVEA.L  #STR_SMEDIUM,A1 
        BSR _DISPSTR
        ADD.B    D3,D2
        BSR      _GOTOXY
        MOVEA.L  #STR_HARD,A1 
        BSR _DISPSTR
        ADD.B    D3,D2
        BSR      _GOTOXY
        MOVEA.L  #STR_INSANE,A1
        BSR _DISPSTR
        BRA get_select
draw_hard_select
        MOVE.L  #SNK_SPEED_HARD,SNK_SPEED ; set snake speed for this option

        BSR      _GOTOXY
        MOVEA.L  #STR_EASY,A1 
        BSR _DISPSTR
        ADD.B    D3,D2
        BSR      _GOTOXY
        MOVEA.L  #STR_MEDIUM,A1 
        BSR _DISPSTR
        ADD.B    D3,D2
        BSR      _GOTOXY
        MOVEA.L  #STR_SHARD,A1 
        BSR _DISPSTR
        ADD.B    D3,D2
        BSR      _GOTOXY
        MOVEA.L  #STR_INSANE,A1 
        BSR _DISPSTR
        BRA get_select
draw_insane_select
        MOVE.L  #SNK_SPEED_INSANE,SNK_SPEED ; set snake speed for this option

        BSR      _GOTOXY
        MOVEA.L  #STR_EASY,A1 ; draw splash screen
        BSR _DISPSTR
        ADD.B    D3,D2
        BSR      _GOTOXY
        MOVEA.L  #STR_MEDIUM,A1 ; draw splash screen
        BSR _DISPSTR
        ADD.B    D3,D2
        BSR      _GOTOXY
        MOVEA.L  #STR_HARD,A1 ; draw splash screen
        BSR _DISPSTR
        ADD.B    D3,D2
        BSR      _GOTOXY
        MOVEA.L  #STR_SINSANE,A1 ; draw splash screen
        BSR _DISPSTR
        BRA get_select

get_select
        MOVE.B   #0,D1    
        MOVE.B   #0,D2
        BSR _SGETCH  ; else, get the character 

        CMP.B  #0,TOUCH_CONFIRM_PENDING
        BEQ    select_read_keys
        CLR.B  TOUCH_CONFIRM_PENDING
        MOVEM.L (SP)+,D0-D3
        RTS

select_read_keys

        CMP.B  #'s',D0 ; check if down arrow was pressed
        BEQ    select_key_down

        CMP.B  #'w',D0 ; check if left arrow was pressed
        BEQ    select_key_up  
       
        CMP.B  #$0D,D0 ; check if enter key was pressed
        BNE    draw_select  
        MOVEM.L (SP)+,D0-D3
        RTS

select_key_down
        CMP.B   #3,DIFFICULTY       ; check to see if we're at bottom of menu
        BEQ     draw_select  ; if so, don't go down any more
        ADDI.B  #1,DIFFICULTY
        BRA     draw_select

select_key_up
        CMP.B   #0,DIFFICULTY       ; check to see if we're at top of menu
        BEQ     draw_select  ; if so, don't go up any more
        SUBI.B   #1,DIFFICULTY
        BRA      draw_select

*************************************************************** 
; Function _SELECT_GAMEOVER
; Purpose  Game over selection screen
***************************************************************

_SELECT_GAMEOVER
        MOVEM.L D0-D3,-(SP)
        ; Select Play Again or End Game
        MOVE.B  #0,D3  ; set default select to Medium

gg_draw_select
        CMP     #0,D3  
        BEQ     gg_draw_yes_select        
        CMP     #1,D3  
        BEQ     gg_draw_no_select

gg_draw_yes_select     ; Draw EASY selected
        MOVE.B   #23,D1    
        MOVE.B   #19,D2
        BSR      _GOTOXY
        MOVEA.L  #STR_GG_SYES,A1 ; draw Yes option selected screen
        BSR _DISPSTR
        MOVE.B   #44,D1    
        MOVE.B   #19,D2
        BSR      _GOTOXY
        MOVEA.L  #STR_GG_NO,A1 ; draw No option deselected screen
        BSR _DISPSTR
        BRA gg_get_select

gg_draw_no_select
        MOVE.B   #23,D1    
        MOVE.B   #19,D2
        BSR      _GOTOXY
        MOVEA.L  #STR_GG_YES,A1 ;  draw Yes option deselected screen
        BSR _DISPSTR
        MOVE.B   #44,D1    
        MOVE.B   #19,D2
        BSR      _GOTOXY
        MOVEA.L  #STR_GG_SNO,A1 ; draw No option selected screen

        BSR _DISPSTR

gg_get_select
        MOVE.B   #0,D1    
        MOVE.B   #0,D2
        BSR      _GOTOXY
        BSR _SGETCH  ; else, get the character 

        CMP.B  #'a',D0 ; check if down arrow was pressed
        BEQ    gg_select_key_left

        CMP.B  #'d',D0 ; check if left arrow was pressed
        BEQ    gg_select_key_right
       
        CMP.B  #$0D,D0 ; check if enter key was pressed
        BNE    gg_get_select  ; if not, get another key

        CMP.B  #0,D3   ; see if we're done
        BEQ    gg_done_select 

        TRAP    #11    ; end game
        DC.W    0

        

gg_done_select
        MOVEM.L (SP)+,D0-D3
        RTS

gg_select_key_left
        CMP.B   #0,D3       ; check to see if we're at top of menu
        BEQ     gg_select_key_right  ; if so, don't go up any more
        SUBI.B  #1,D3
        BRA     gg_draw_select

gg_select_key_right
        CMP.B   #1,D3       ; check to see if we're at bottom of menu
        BEQ     gg_select_key_left  ; if so, don't go down any more
        ADDI.B  #1,D3
        BRA     gg_draw_select




***** Subroutine for receiving a character - simulator *****

_SGETCH 
        TRAP	#15
        DC.W	3
        RTS

**** Subroutine for sending character - simulator *****

_SPUTCH 
        TRAP	#15         
        DC.W	1
        RTS

***** Subroutine for receiving a character - trainer board *****
	  
_GETCH  
        MOVEM.L	D1/A0,-(SP)
	  LEA	DUART,A0
IP_POLL 
        MOVE.B	SRA(A0),D1
        BTST	#RxRDY,D1
        BEQ	IP_POLL
        MOVE.B	RBA(A0),D0
        MOVEM.L	(SP)+,D1/A0
        RTS

***** Subroutine for sending character - trainer board *****

_PUTCH  
        MOVEM.L	D1/A0,-(SP)
	  LEA	DUART,A0
OP_POLL 
        MOVE.B	SRA(A0),D1
        BTST	#TxRDY,D1
        BEQ	OP_POLL
        MOVE.B	D0,TBA(A0)
        MOVEM.L	(SP)+,D1/A0
        RTS

TERM_COLS DC.B 80
TERM_ROWS DC.B 25
LAYOUT_PROFILE DC.B LAYOUT_PROFILE_UNKNOWN
GAME_MODE DC.B GAME_MODE_INTRO
TOUCH_PENDING DC.B 0
TOUCH_PHASE DC.B 0
TOUCH_ROW DC.B 0
TOUCH_COL DC.B 0
TOUCH_FLAGS DC.B 0
TOUCH_CONFIRM_PENDING DC.B 0
VIEWPORT_ORIGIN_X DC.B 0
VIEWPORT_ORIGIN_Y DC.B 0
VIEWPORT_COLS DC.B ARENA_X
VIEWPORT_ROWS DC.B ARENA_ROWS
VIEWPORT_SCREEN_Y DC.B 1
BOARD_COLS DC.B ARENA_X
BOARD_ROWS DC.B ARENA_ROWS
BOARD_SIZE DC.W SNK_SCR_SIZE

LIVES   DC.B $00
LEVEL   DC.B $00
FOOD_NUM   DC.B $00
SNK_SPEED DC.L $00000000
SNK_LIFE  DC.W $00
DELAY_DECAY DC.B $00
FOOD_AVAIL DC.B  $00
RAND_MEM  DC.W  $0000

SCORE     DC.B  $00

DIFFICULTY DC.B  $00
POS_X     DC.B  $00
POS_Y     DC.B  $00
LAST_DIR  DC.B  $0F
DIRECTION DS.B  1
MOVING    DS.B  1
TIMER     DS.L  1

SNK_SCR   DS.W  MAX_SNK_SCR_SIZE

STR_EASY   DC.B    '[36m  EASY  [0m',0
STR_MEDIUM DC.B    '[35m MEDIUM [0m',0
STR_HARD   DC.B    '[33m  HARD  [0m',0
STR_INSANE DC.B    '[31m INSANE [0m',0

STR_SEASY   DC.B   '[30;46m  EASY  [0m',0
STR_SMEDIUM DC.B   '[30;45m MEDIUM [0m',0
STR_SHARD   DC.B   '[30;43m  HARD  [0m',0
STR_SINSANE DC.B   '[30;41m INSANE [0m',0

STR_GG_YES  DC.B   '[34mPLAY AGAIN[0m',0
STR_GG_SYES DC.B   '[1;36mPLAY AGAIN[0m',0

STR_GG_NO   DC.B   '[35mNO, THANKS[0m',0
STR_GG_SNO  DC.B   '[1;36mNO, THANKS[0m',0

STR_ESC   DC.B    $1B,'[',0
STR_UP    DC.B    $1B,'[1A',0
STR_DOWN  DC.B    $1B,'[1B',0
STR_FWD   DC.B    $1B,'[1C',0
STR_REV   DC.B    $1B,'[1D',0
STR_CLS   DC.B    $1B,'[2J',0
STR_COL_RED   DC.B  $1B,'[31m',0
STR_COL_YELLOW DC.B '[33m',0
STR_COL_GREEN  DC.B '[32m',0
STR_COL_CYAN   DC.B '[36m',0
STR_COL_MAGENTA DC.B '[35m',0
STR_COL_WALL   DC.B '[1;36m',0
STR_COL_DEFAULT DC.B '[0m',0

STR_SNK_SEG DC.B     $1B,'[1;32m',$DB,0
STR_WALL  DC.B     $1B,'[1;36m',$DB,0
STR_FOOD  DC.B     $1B,'[33m','*',0
STR_HOME  DC.B    '[0;0H',0

STR_INTRO_TITLE DC.B '[1;35mNIBBLES[0m',0
STR_INTRO_SUBTITLE DC.B '[36mNEON SERPENT ARCADE[0m',0
STR_INTRO_SUBTITLE_SHORT DC.B '[36mNEON SERPENT[0m',0
STR_INTRO_TOUCH_HINT DC.B '[33mTouch a row or use W / S + Enter[0m',0
STR_INTRO_TAP_ROW DC.B '[33mTap a row to start[0m',0
STR_INTRO_SELECT_LABEL DC.B '[35mSELECT DIFFICULTY[0m',0
STR_INTRO_MOVE_HINT DC.B '[32mMovement Keys: W A S D[0m',0
STR_INTRO_SITE DC.B '[35msmysnk.com[0m',0
STR_INTRO_AUTHOR DC.B '[36mJoshua Bellamy[0m',0
STR_INTRO_TAP_DIFFICULTY DC.B '[33mTap difficulty[0m',0
STR_INTRO_KEYS_HINT DC.B '[32mor W / S + Enter[0m',0

STR_SPLASH_SCR DC.B $1B,'[2;27H',$1B,'[1;35mNIBBLES',$1B,'[0m'
 DC.B $1B,'[3;22H',$1B,'[36mNEON SERPENT ARCADE',$1B,'[0m'
 DC.B $1B,'[5;14H',$1B,'[33mTouch a row or use W / S + Enter',$1B,'[0m'
 DC.B $1B,'[7;11H',$1B,'[35mSELECT DIFFICULTY',$1B,'[0m'
 DC.B $1B,'[15;27H',$1B,'[32mMovement Keys: W A S D',$1B,'[0m'
 DC.B $1B,'[22;4H',$1B,'[35msmysnk.com',$1B,'[0m'
 DC.B $1B,'[23;4H',$1B,'[36mJoshua Bellamy',$1B,'[0m',0

STR_SPLASH_LANDSCAPE DC.B $1B,'[2;18H',$1B,'[1;35mNIBBLES',$1B,'[0m'
 DC.B $1B,'[3;10H',$1B,'[36mNEON SERPENT ARCADE',$1B,'[0m'
 DC.B $1B,'[4;7H',$1B,'[33mTap a row to start',$1B,'[0m'
 DC.B $1B,'[5;7H',$1B,'[35mSELECT DIFFICULTY',$1B,'[0m'
 DC.B $1B,'[10;3H',$1B,'[35msmysnk.com',$1B,'[0m'
 DC.B $1B,'[10;18H',$1B,'[36mJoshua Bellamy',$1B,'[0m',0

STR_SPLASH_PORTRAIT DC.B $1B,'[2;10H',$1B,'[1;35mNIBBLES',$1B,'[0m'
 DC.B $1B,'[3;6H',$1B,'[36mNEON SERPENT',$1B,'[0m'
 DC.B $1B,'[5;4H',$1B,'[35mSELECT DIFFICULTY',$1B,'[0m'
 DC.B $1B,'[6;4H',$1B,'[33mTap difficulty',$1B,'[0m'
 DC.B $1B,'[7;4H',$1B,'[32mor W / S + Enter',$1B,'[0m',0
STR_SPLASH_PORTRAIT_FOOTER DC.B $1B,'[18;2H',$1B,'[35msmysnk.com',$1B,'[0m'
 DC.B $1B,'[19;2H',$1B,'[36mJoshua Bellamy',$1B,'[0m',0

STR_HUD_SCORE_LABEL DC.B 'SCORE:',0
STR_HUD_LIVES_LABEL DC.B 'LIVES:',0
STR_HUD_LEVEL_LABEL DC.B 'LEVEL:',0
STR_HUD_SCORE_SHORT DC.B 'S:',0
STR_HUD_LIVES_SHORT DC.B 'L:',0
STR_HUD_LEVEL_SHORT DC.B 'Lv:',0


STR_ARENA_SCR DC.B '[2J[0m[1;31m������������������������������������������������������������������������������Ŀ�[0m[78C[1;31m�� '
 DC.B '[0m[77C[1;31m��[0m[78C[1;31m��[0m[78C[1;31m��[0m[78C[1;31m��[0m[78C[1;31m��[0m[78C[1;31m��[0m[78C[1;31m��'
 DC.B '[0m[78C[1;31m��[0m[78C[1;31m��[0m[78C[1;31m��[0m[78C[1;31m��[0m[78C[1;31m��[0m[78C[1;31m��[0m[78C[1;31m��'
 DC.B '[0m[78C[1;31m��[0m[78C[1;31m��[0m[78C[1;31m��[0m[78C[1;31m��[0m[78C[1;31m��[0m[78C[1;31m��'
 DC.B '                                                                              �������������������������������'
 DC.B '��������������������������������������������������      [33mSCORE:          LIVES:          LEVEL:[33m                    smysnk.com[0m',0

STR_GAME_OVER_SCR DC.B '[2J[0m',$0D,$0A
 DC.B '',$0D,$0A
 DC.B '',$0D,$0A
 DC.B '',$0D,$0A
 DC.B '[16C[1;31m����������  ���������  ����   ���� �����������[0m',$0D,$0A
 DC.B '[15C[1;31m�����   ��� ����������� ����������� ����    ���[0m',$0D,$0A
 DC.B '[15C[1;31m����  ����  ����������� ����������� ���������[0m',$0D,$0A
 DC.B '[15C[1;31m����  ����� ����������� ���� � ���� ���������[0m',$0D,$0A
 DC.B '[15C[1;31m����������� ����   ���� ����   ���� ����    ���[0m',$0D,$0A
 DC.B '[16C[1;31m���������� ����   ���� ����   ���� �����������[0m',$0D,$0A
 DC.B '',$0D,$0A
 DC.B '[16C[1;31m���������  ����   ���� ����������� ����������[0m',$0D,$0A
 DC.B '[15C[1;31m����������� ����   ���� ����    ��� ����   ����[0m',$0D,$0A
 DC.B '[15C[1;31m���[0m[5C[1;31m��� ����   ���� ���������   ����   ����[0m',$0D,$0A
 DC.B '[15C[1;31m���[0m[5C[1;31m��� ����� ����� ���������   ����������[0m',$0D,$0A
 DC.B '[15C[1;31m�����������  ���������  ����    ��� ���� ������[0m',$0D,$0A
 DC.B '[16C[1;31m���������[0m[5C[1;31m�����    ����������� ����   ����[0m',$0D,$0A
 DC.B '',$0D,$0A
 DC.B '[15C[1;34m���������������������������������������������͸[0m',$0D,$0A
 DC.B '[15C[1;34m�[0m [1;34m     [0m [1;34mPLAY AGAIN    [0m[7C[1;34mNO, THANKS[0m[7C[1;34m�[0m',$0D,$0A
 DC.B '[15C[1;34m���������������������������������������������;[0m',$0D,$0A,0

 
STR_GAME_COMPLETE_SCR DC.B '[2J[0m',$0D,$0A
 DC.B '',$0D,$0A
 DC.B '',$0D,$0A
 DC.B '',$0D,$0A
 DC.B '',$0D,$0A
 DC.B '[23C[1;34m�����    �����  ���   ��� �������[0m',$0D,$0A
 DC.B '[22C[1;34m��[0m[7C[1;34m��   �� ���� ���� ��[0m',$0D,$0A
 DC.B '[21C[1;34m���  ���� ������� �� ��� �� �����[0m',$0D,$0A
 DC.B '[22C[1;34m��   ��  ��   �� ��  �  �� ��[0m',$0D,$0A
 DC.B '[23C[1;34m�����   ��   �� ��[0m[5C[1;34m�� �������[0m',$0D,$0A
 DC.B '',$0D,$0A
 DC.B '[7C[1;34m�����    �����   ���   ��� ������  ��[0m[6C[1;34m������� �������� �������[0m',$0D,$0A
 DC.B '[6C[1;34m��   ��  ��   ��  ���� ���� ��   �� ��[0m[6C[1;34m��[0m[9C[1;34m��    ��[0m',$0D,$0A
 DC.B '[5C[1;34m���[0m[6C[1;34m���   ��� �� ��� �� ������  ��[0m[6C[1;34m�����[0m[6C[1;34m��    �����[0m',$0D,$0A
 DC.B '[6C[1;34m��   ��  ��   ��  ��  �  �� ��[0m[6C[1;34m��[0m[6C[1;34m��[0m[9C[1;34m��    ��[0m',$0D,$0A
 DC.B '[7C[1;34m�����    �����   ��[0m[5C[1;34m�� ��[0m[6C[1;34m������� �������    ��    �������[0m',$0D,$0A
 DC.B '',$0D,$0A
 DC.B '',$0D,$0A
 DC.B '[27C[1;31mProgrammed by Joshua Bellamy[0m',$0D,$0A
 DC.B '[31C[1;31msmysnk.com',$0D,$0A,0

STR_LEVEL1 
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '

STR_LEVEL2 
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '             wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '

STR_LEVEL3 
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                      w                                       '
 DC.B '                                      w                                       '
 DC.B '                                      w                                       '
 DC.B '                                      w                                       '
 DC.B '                                      w                                       '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                 wwwwwwwwwwwwwww             wwwwwwwwwwwwwww                  '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                      w                                       '
 DC.B '                                      w                                       '
 DC.B '                                      w                                       '
 DC.B '                                      w                                       '
 DC.B '                                      w                                       '
 DC.B '                                      w                                       '
 DC.B '                                                                              '
 DC.B '                                                                              '

STR_LEVEL4 
 DC.B '              w                                                               '
 DC.B '              w                                                               '
 DC.B '              w                                                               '
 DC.B '              w                                                               '
 DC.B '              w                                                               '
 DC.B '              w                                wwwwwwwwwwwwwwwwwwwwwwwwwwwwwww'
 DC.B '              w                                                               '
 DC.B '              w                                                               '
 DC.B '              w                                                               '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                         w                    '
 DC.B '                                                         w                    '
 DC.B '                                                         w                    '
 DC.B 'wwwwwwwwwwwwwwwwwwwwwwwww                                w                    '
 DC.B '                                                         w                    '
 DC.B '                                                         w                    '
 DC.B '                                                         w                    '
 DC.B '                                                         w                    '
 DC.B '                                                         w                    '
 DC.B '                                                         w                    '


STR_LEVEL5 
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                      wwwwwwwwwwwwwwwwwwwwwwwwwwwwwww                         '
 DC.B '                                                                              '
 DC.B '                    w                                 w                       '
 DC.B '                    w                                 w                       '
 DC.B '                    w                                 w                       '
 DC.B '                    w                                 w                       '
 DC.B '                    w                                 w                       '
 DC.B '                    w                                 w                       '
 DC.B '                    w                                 w                       '
 DC.B '                    w                                 w                       '
 DC.B '                    w                                 w                       '
 DC.B '                    w                                 w                       '
 DC.B '                                                                              '
 DC.B '                      wwwwwwwwwwwwwwwwwwwwwwwwwwwwwww                         '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '

STR_LEVEL6 
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '

STR_LEVEL7 
 DC.B '                                      w                                       '
 DC.B '                                                                              '
 DC.B '                                      w                                       '
 DC.B '                                                                              '
 DC.B '                                      w                                       '
 DC.B '                                                                              '
 DC.B '                                      w                                       '
 DC.B '                                                                              '
 DC.B '                                      w                                       '
 DC.B '                                                                              '
 DC.B '                                      w                                       '
 DC.B '                                                                              '
 DC.B '                                      w                                       '
 DC.B '                                                                              '
 DC.B '                                      w                                       '
 DC.B '                                                                              '
 DC.B '                                      w                                       '
 DC.B '                                                                              '
 DC.B '                                      w                                       '
 DC.B '                                                                              '
 DC.B '                                      w                                       '
 DC.B '                                                                              '

STR_LEVEL8 
 DC.B '       w                    w                    w                  w         '
 DC.B '       w                    w                    w                  w         '
 DC.B '       w                    w                    w                  w         '
 DC.B '       w                    w                    w                  w         '
 DC.B '       w                    w                    w                  w         '
 DC.B '       w         w          w         w          w         w        w         '
 DC.B '       w         w          w         w          w         w        w         '
 DC.B '       w         w          w         w          w         w        w         '
 DC.B '       w         w          w         w          w         w        w         '
 DC.B '       w         w          w         w          w         w        w         '
 DC.B '       w         w          w         w          w         w        w         '
 DC.B '       w         w          w         w          w         w        w         '
 DC.B '       w         w          w         w          w         w        w         '
 DC.B '       w         w          w         w          w         w        w         '
 DC.B '       w         w          w         w          w         w        w         '
 DC.B '       w         w          w         w          w         w        w         '
 DC.B '       w         w          w         w          w         w        w         '
 DC.B '                 w                    w                    w                  '
 DC.B '                 w                    w                    w                  '
 DC.B '                 w                    w                    w                  '
 DC.B '                 w                    w                    w                  '
 DC.B '                 w                    w                    w                  '

STR_LEVEL9 
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '     ww                             ww                                        '
 DC.B '       ww                             ww                                      '
 DC.B '         ww                             ww                                    '
 DC.B '          ww                              ww                                  '
 DC.B '            ww                              ww                                '
 DC.B '              ww                              ww                              '
 DC.B '                ww                              ww                            '
 DC.B '                  ww                              ww                          '
 DC.B '                    ww                              ww                        '
 DC.B '                      ww                              ww                      '
 DC.B '                        ww                              ww                    '
 DC.B '                          ww                              ww                  '
 DC.B '                            ww                              ww                '
 DC.B '                              ww                              ww              '
 DC.B '                                ww                              ww            '
 DC.B '                                  ww                              ww          '
 DC.B '                                    ww                              ww        '
 DC.B '                                      ww                              ww      '
 DC.B '                                                                              '
 DC.B '                                                                              '

STR_LEVEL10 
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '          wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww             '
 DC.B '                                                                              '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '                                                                              '
 DC.B '          wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww             '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '          wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww             '
 DC.B '                                                                              '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '                                                                              '
 DC.B '          wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww             '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '

STR_LEVEL11 
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '        wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww           '
 DC.B '                                                                  w           '
 DC.B '                                                                  w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                                     '
 DC.B '        w                                                                     '
 DC.B '        wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww           '
 DC.B '                                                                              '
 DC.B '                                                                              '


STR_LEVEL12 
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '        wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww           '
 DC.B '                                                                              '
 DC.B '                                                                              '


STR_LEVEL13 
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '        wwwwwwwwwwwwwww                                           w           '
 DC.B '        w              ww                                         w           '
 DC.B '        w                ww                                       w           '
 DC.B '        w                  ww                                     w           '
 DC.B '        w                    ww                                   w           '
 DC.B '        w                      ww                                 w           '
 DC.B '        w                        ww                               w           '
 DC.B '        w                          ww                             w           '
 DC.B '        w                            ww                           w           '
 DC.B '        w                              ww                         w           '
 DC.B '        w                                ww                       w           '
 DC.B '        w                                  ww                     w           '
 DC.B '        w                                    ww                   w           '
 DC.B '        w                                      ww                 w           '
 DC.B '        w                                        ww               w           '
 DC.B '        w                                          wwwwwwwwwwwwwwww           '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '


STR_LEVEL14 
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '        wwwwwwwwwwww                                wwwwwwwwwwwwwww           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w          wwwwwww                     wwwwwwww           w           '
 DC.B '        w         w                                    w          w           '
 DC.B '        w         w                                    w          w           '
 DC.B '        w         w                                    w          w           '
 DC.B '        w         w                                    w          w           '
 DC.B '        w         w                                    w          w           '
 DC.B '        w          wwwwwww                     wwwwwwww           w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        wwwwwwwwwwwwww                              wwwwwwwwwwwwwww           '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '


STR_LEVEL15 
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '        wwwwwwwwwwww                                wwwwwwwwwwwwwww           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w         wwwwwwww                     wwwwwwwww          w           '
 DC.B '        w                 w                   w                   w           '
 DC.B '        w                 w                   w                   w           '
 DC.B '        w                 w                   w                   w           '
 DC.B '        w                 w                   w                   w           '
 DC.B '        w                 w                   w                   w           '
 DC.B '        w                 w                   w                   w           '
 DC.B '        w         wwwwwwww                     wwwwwwwww          w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        wwwwwwwwwwwwww                              wwwwwwwwwwwwwww           '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '


STR_LEVEL16
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '        wwwwwwwwwwww         wwwwwwwwwwwwwww          wwwwwwwwwwwww           '
 DC.B '        w           ww                              ww            w           '
 DC.B '        w             ww                          ww              w           '
 DC.B '        w               ww                      ww                w           '
 DC.B '        w                 ww     wwwwwww      ww                  w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                 ww     wwwwwww      ww                  w           '
 DC.B '        w               ww                      ww                w           '
 DC.B '        w             ww                          ww              w           '
 DC.B '        w           ww                              ww            w           '
 DC.B '        wwwwwwwwwwww         wwwwwwwwwwwwwww          wwwwwwwwwwwww           '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '


STR_LEVEL17
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '        wwwwwwwwwwwww        wwwwwwwwwwwwwww         wwwwwwwwwwwwww           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                    wwwwwwwwwwwwwww              wwwwwwwww           '
 DC.B '        wwwwwwwww                                                 w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        wwwwwwwww                                         wwwwwwwww           '
 DC.B '        w                    wwwwwwwwwwwwwww                      w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        w                                                         w           '
 DC.B '        wwwwwwwwwwwww        wwwwwwwwwwwwwww         wwwwwwwwwwwwww           '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '


STR_LEVEL18
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '        wwwwwwwwwwwww        wwwwwwwwwwwwwww         wwwwwwwwwwwwww           '
 DC.B '                     ww                            ww                         '
 DC.B '                       ww                        ww                           '
 DC.B '                         ww                    ww                             '
 DC.B '                           wwwwwwwwwwwwwwwwwwww                               '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                           wwwwwwwwwwwwwwwwwwww                               '
 DC.B '                         ww                    ww                             '
 DC.B '                       ww                        ww                           '
 DC.B '                     ww                            ww                         '
 DC.B '        wwwwwwwwwwwww        wwwwwwwwwwwwwww         wwwwwwwwwwwwww           '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '


STR_LEVEL19
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          wwwwwwwwwwww          wwwwwwwwwwww          wwwwwwwwwwww            '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '          wwwwwwwwwwww          wwwwwwwwwwww          wwwwwwwwwwww            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '                                                                              '
 DC.B '                                                                              '


STR_LEVEL20
 DC.B '                                                                              '
 DC.B '            wwwwwwww              wwwwwwww              wwwwwwww              '
 DC.B '                                                                              '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '                                                                              '
 DC.B '            wwwwwwww              wwwwwwww              wwwwwwww              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '            wwwwwwww              wwwwwwww              wwwwwwww              '
 DC.B '                                                                              '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '                                                                              '
 DC.B '            wwwwwwww              wwwwwwww              wwwwwwww              '
 DC.B '                                                                              '

STR_LEVEL21
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '          wwwwwwwwwwww          wwwwwwwwwwww          wwwwwwwwwwww            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          wwwwwwwwwww           wwwwwwwwwwww          w            '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '                                                                              '
 DC.B '          w          wwwwwwwwwwww          wwwwwwwwwwww          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          w          w          w          w          w          w            '
 DC.B '          wwwwwwwwwwww          wwwwwwwwwwww          wwwwwwwwwwww            '
 DC.B '                                                                              '
 DC.B '                                                                              '

STR_LEVEL22 
 DC.B '                   w                   w                   w                  '
 DC.B '         w                   w                   w                   w        '
 DC.B '                   w                   w                   w                  '
 DC.B '         w                   w                   w                   w        '
 DC.B '                   w                   w                   w                  '
 DC.B '         w                   w                   w                   w        '
 DC.B '                   w                   w                   w                  '
 DC.B '         w                   w                   w                   w        '
 DC.B '                   w                   w                   w                  '
 DC.B '         w                   w                   w                   w        '
 DC.B '                   w                   w                   w                  '
 DC.B '         w                   w                   w                   w        '
 DC.B '                   w                   w                   w                  '
 DC.B '         w                   w                   w                   w        '
 DC.B '                   w                   w                   w                  '
 DC.B '         w                   w                   w                   w        '
 DC.B '                   w                   w                   w                  '
 DC.B '         w                   w                   w                   w        '
 DC.B '                   w                   w                   w                  '
 DC.B '         w                   w                   w                   w        '
 DC.B '                   w                   w                   w                  '
 DC.B '         w                   w                   w                   w        '



        END NIBBLES
