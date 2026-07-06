-------------- Dev- environment ---------------------
dev.jackpotsworld.com (Frontend)
api-dev.jackpotsworld.com (Backend)


------------ Prod - environment -----------------
jackpotworlds.com (Frontend)
api.jackpotsworld.com (Backend)

we will have two branches in github 
1.Main Branch
2.Dev Branch

Developer will develop the code and push to Dev branch that dev branch uses:
dev.jackpotsworld.com (Frontend)
api-dev.jackpotsworld.com (Backend)

These domains for testing which will not be accessable to every one in the public(only testers whome we give access).

once testing is done if any chnages needed again the code will go to developers and fix the issues again push to dev branch (this will happen until its production ready)

once everything is fixed if we are good to go for production just merge dev branch with Main branch , so it will be live in production

Main branch is production which uses domains:
jackpotworlds.com (Frontend)
api.jackpotsworld.com(Backend)

Advantages:
best architecture (industries use same)
easy to find bugs and debug
many bugs wont reah users (Since we fix in dev server)
maintainable backend server setup
server load will be less
cost optmization
testing traffic does not affect production users.

------------- final architecture --------------
Developer
   ↓
Push code
   ↓
Dev Branch
   ↓
Testing on dev server
   ↓
Bug fixes
   ↓
Merge → Main Branch
   ↓
Production deployment





