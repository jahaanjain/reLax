// Importing helpful libraries:

// Helps us interact with firebase database
const admin = require("firebase-admin");
// Helps us set up a frontend & backend environment
const express = require("express");
// Lets the user sign-in using google
const passport = require("passport");
// Selects random file from specified path and returns file-path
const randomFile = require("select-random-file");

// Setup the google authentication through passport
var GoogleStrategy = require("passport-google-oauth").OAuth2Strategy;
// Lets the website run through https instead of http
var https = require("https");
// Lets us read files that are not this one
var fs = require("fs");
// Initialize the web server
const app = express();
// ejs is the server-side rendering engine that we use
app.set("view engine", "ejs");
// let the webserver automatically display files to the public that are in the /public/ directory
app.use(express.static("public"));
app.use(require("serve-static")(__dirname + "/../../public"));
// Allows us to recieve POST fetch requests
app.use(require("cookie-parser")());
app.use(require("body-parser").urlencoded({ extended: true }));
app.use(require("body-parser").json());
app.use(
  require("express-session")({
    secret: "keyboard cat",
    resave: true,
    saveUninitialized: true,
  })
);
app.use(passport.initialize());
app.use(passport.session());

// read the config file
const config = JSON.parse(fs.readFileSync("./config/config.json"));
// read the firebase config file
const serviceAccount = require("./config/firebase-key.json");
// startup the firebase connection
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: config.databaseURL,
});
const db = admin.firestore();

// startup the whole https server
// const privateKey = fs.readFileSync("/etc/letsencrypt/live/relax.jahaanjain.com/privkey.pem", "utf8");
// const certificate = fs.readFileSync("/etc/letsencrypt/live/relax.jahaanjain.com/cert.pem", "utf8");
// const ca = fs.readFileSync("/etc/letsencrypt/live/relax.jahaanjain.com/chain.pem", "utf8");
// const credentials = { key: privateKey, cert: certificate, ca: ca };
// const httpsServer = https.createServer(credentials, app);
// httpsServer.listen(1337, () => {
//   console.log("HTTPS Server running on port 1337");
// });

// when initializing the github repo, you can use this temporarily
app.listen(1337, () => {
  console.log(`Relax app listening at http://localhost:1337`);
});

// tells passport to use google as its authentication method
passport.use(
  new GoogleStrategy(
    {
      // Config details from the config.json file that was read earlier
      clientID: config.google.clientID,
      clientSecret: config.google.clientSecret,
      callbackURL: config.google.callbackURL,
    },
    async function (accessToken, refreshToken, profile, done) {
      // once the user logs in, we try to find if the user is registered
      const findUser = db.collection("users").doc(profile.id);
      const doc = await findUser.get();
      if (!doc.exists) {
        // user does not exist
        await db
          .collection("users")
          .doc(profile.id)
          .set({
            firstName: profile.name.givenName,
            lastName: profile.name.familyName,
            preferences: {
              placeholder1: null,
              placeholder2: null,
            },
            todoList: ["Edit this list with any of your goals."],
          });
        done(null, { data: profile, userID: profile.id });
      } else {
        // user exists
        done(null, { data: doc.data(), userID: profile.id });
      }
    }
  )
);

// whenever the user navigates the page, it makes sure they are authenticated
async function checkAuthentication(req, res, next) {
  if (req.isAuthenticated()) {
    const findUser = db.collection("users").doc(req.user.userID);
    const doc = await findUser.get();
    req.user = { data: doc.data(), userID: req.user.userID };
    next();
  } else {
    req.user = { data: null, userID: null };
    next();
  }
}

// whenever the user attempts to modify something in the page that requires the backend API to be called,
// this function checks that they are authenticated
function checkAuthenticationAPI(req, res, next) {
  if (req.isAuthenticated()) {
    next();
  } else {
    res.json({ status: 400, error: "Calm down. You should not be doing this." });
  }
}
// returns user info
passport.serializeUser(function (user, done) {
  done(null, user);
});
passport.deserializeUser(function (user, done) {
  done(null, user);
});

// the path for users to login with google
app.get("/auth/google", passport.authenticate("google", { scope: ["https://www.googleapis.com/auth/plus.login"] }));
// google redirects to this page after login
app.get("/auth/google/callback", passport.authenticate("google", { failureRedirect: "/?success=false" }), function (req, res) {
  res.redirect("/");
});
// the main page
app.get("/", checkAuthentication, async (req, res) => {
  // get a random background image from the file path
  async function getBG() {
    return new Promise(function (resolve, reject) {
      const dir = "./public/assets/images";
      randomFile(dir, (err, file) => {
        resolve(file);
      });
    });
  }
  let bg = await getBG();
  // render the page through ejs
  res.render("main", { user: req.user, quote: getQuote(), bg: bg });
});

app.get("/logout", function (req, res) {
  req.logout();
  res.redirect("/");
});

// this api endpoint is used to change user information for their todo list
app.post("/todo", checkAuthenticationAPI, async (req, res) => {
  let userID = req.body.userID;
  let todoListID = req.body.todoListID;
  let operation = req.body.operation;
  // find the user in firebase
  const userRef = db.collection("users").doc(userID);
  const doc = await userRef.get();
  if (!doc.exists) return res.json({ status: 404, error: "Don't panic. Your account was not found." });
  let updatedTodoList = doc.data().todoList;
  if (operation === "delete") {
    updatedTodoList.splice(todoListID, 1);
    if (updatedTodoList.length === 0) updatedTodoList.push(`You're up to date. Nice work.`);
  }
  if (operation === "change") {
    updatedTodoList[todoListID] = req.body.todoListDescription;
  }
  if (operation === "create") {
    let motivateTodoList = [`That's the spirit. What do you want to do?`, "Good job. What needs to be done?", "Making progress. What's next?"];
    updatedTodoList.push(motivateTodoList[Math.floor(Math.random() * motivateTodoList.length)]);
  }
  await userRef.update({ todoList: updatedTodoList });
  return res.json({ success: 200, operation: operation, table: updatedTodoList });
});

// bunch of quotes
function getQuote() {
  let quotes = [
    "Excellence does not require perfection.",
    "Prepare like you have never won and perform like you have never lost.",
    "Trust the process.",
    "A vision is a dream with a plan.",
    "You only fail when you stop trying.",
    "Make it a great day or not, the choice is yours.",
    "Bloom where you are planted.",
    "People support a world they help create.",
    "Wherever you are, be all there.",
    "Nothing in nature blooms all year. Be patient with yourself.",
    "If you want to achieve greatness, stop asking for permission.",
    "Don't major in minor things.",
    "Have big dreams, you'll grow into them.",
    "A flourishing career starts with persistence.",
    "Under promise, over deliver.",
    "You can and you will.",
    "You have a purpose.",
    "Happiness is a choice.",
    "Progress is a process.",
    "One year equals 365 possibilities.",
    "Claim your values; pick your priorities.",
    "No one is going to do it like you.",
    "You've worked hard. Now it's time to unwind.",
    "Big journeys begin with the small steps.",
    "If the plan doesn’t work, change the plan—but never the goal.",
    "As you know more, you grow more.",
    "Trust your crazy ideas.",
    "Don’t be afraid to be great.",
    "Take it easy, you will reach your destination.",
  ];
  return quotes[Math.floor(Math.random() * quotes.length)];
}
