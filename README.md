
This is a game to teach kids subtraction. We will start with level 1 and allow the game loop to happen 10 times as the default (make them configurable via url params)

# Level 1

- Use index.html and main.js and a canvas to display the game
- Start by asking the user to press space
- When the user press space:
  - Say "Welcome to What is the change"
  - Start the game loop
- The game loop consist of
  - Display 3 columns with headers
    - the first is "Today" and display the number of pennies I have today (the first row below the header shows the number, and then display each penny in rows below, 1 penny per row)
    - the second is "Yesterday" and display the number of pennies I have yesterday (same way to display)
    - the third is "Change" without displaying the answer
    - Randomly pick 2 numbers between 0 and 9 and use the bigger one for Now and the other one for Yesterday
  - Tell the user: "I had X cents yesterday and Y cents today. How much more money do I have today than yesterday?"
  - When the user type a digit, display the digit in the "Change" column. If the user answer is too big or too small, tell it to the user and ask him to try again, and then clear the digit from the display
  - If the user type the correct digit, then show the work by counting the extra pennies in the "Today" column (highlighting the penny as you are counting it), and after counting, say "I have Z more cents today than yesterday."
  - Then repeat the game loop

# Level 2

- Same as level 1, except at the end, also say "Fun fact: X minus Y equals Z" and render the minus and equal sign between the 3 columns' numbers

# Level 3

- I would like to support more cents, make it configurable via the url param max and default to 20. We will also need to make the layout better. When there are more than 10 cents, have pennies overflow to side sub-column of the first column of pennies
  - Handle multi-digit by just accepting the answer once it reaches the number of digits you expect
  - Handle the dash line by drawing it not across multiple sub-columns but just the 1 that is actually different.