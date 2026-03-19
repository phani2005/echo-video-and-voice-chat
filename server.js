import express from "express"
import mongoose from "mongoose"
import multer from "multer"
import nodemailer from "nodemailer"
import { createServer } from "http"
import { Server } from "socket.io"
import { type } from "os"
import dotenv from "dotenv"
import cors from "cors"
import { v2 as cloudinary } from "cloudinary"
import { CloudinaryStorage } from "multer-storage-cloudinary"
dotenv.config()
const app = express()
app.use(cors())
app.use(express.json())
app.use(express.static("public"))
app.use(express.urlencoded({ extended: true }))
app.use("/uploads", express.static("uploads"))
const httpServer = createServer(app)
cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_API_KEY,
    api_secret: process.env.CLOUD_API_SECRET
})
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
})
const PORT=process.env.PORT||5000
mongoose.connect(process.env.MONGO_URL)
    .then(() => { console.log("Mongodb is connected successfully") })
    .catch((e) => { console.log(e) })
const onlineUsers = {}//online users object
const userschema = new mongoose.Schema({
    username: String,
    email: String,
    password: String,
    profileimage: String,
    blockedUsers: [String],
    contacts: [
        {
            name: String,
            email: String
        }
    ]
})
const User = mongoose.model("User", userschema)
const groupSchema = new mongoose.Schema({
    name: String,
    members: [String], // emails
    admin: String,
    profileimage: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
})

const Group = mongoose.model("Group", groupSchema)
const messageSchema = new mongoose.Schema({
    from: String,
    to: String, // keep for private
    message: String,
    type: { type: String, default: "text" },

    isGroup: { type: Boolean, default: false },
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Group"
    },

    timestamp: { type: Date, default: Date.now },
    delivered: { type: Boolean, default: false },
    seen: { type: Boolean, default: false },
    deletedFor: [String],
    deletedForEveryone: { type: Boolean, default: false },
    hiddenFor: [String]
})

const Message = mongoose.model("Message", messageSchema)
const callSchema = new mongoose.Schema({
    caller: String,
    receiver: String,
    type: String, // voice or video
    direction: String, // outgoing or incoming
    duration: Number,
    missed: {
        type: Boolean,
        default: false
    },
    timestamp: { type: Date, default: Date.now }
})

const Call = mongoose.model("Call", callSchema)
const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {

        console.log("Uploading file:", file.originalname)

        return {
            folder: "chat-app",
            resource_type: "auto",
            public_id: Date.now().toString()
        }
    }
})
const upload = multer({ storage })
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // TLS
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    },
    family: 4 // 🔥 FORCE IPv4 (IMPORTANT)
})
let tempUser = {}
let generatedOTP = ""
let resetemail = ""
app.post("/register", upload.single("photo"), async (req, res) => {
    try {

        const { username, email, password } = req.body

        const existingUser = await User.findOne({ email })
        if (existingUser) {
            return res.json({ success: false, message: "User exists" })
        }

        generatedOTP = Math.floor(100000 + Math.random() * 900000).toString()

        tempUser = {
            username,
            email,
            password,
            profileimage: req.file ? req.file.path : ""
        }

        console.log("TEMP USER:", tempUser)

        // 🔥 TRY sending mail but DON'T CRASH if fails
        try {
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: email,
                subject: "OTP Verification",
                text: "Your OTP is: " + generatedOTP
            })
            console.log("Email sent")
        } catch (mailErr) {
            console.log("MAIL ERROR:", mailErr.message)
        }

        res.json({ success: true }) // ✅ ALWAYS RESPOND

    } catch (err) {
        console.log("REGISTER ERROR:", err)
        res.json({ success: false, message: "Server error" })
    }
})
app.post("/verify-otp", async (req, res) => {
    const { otp } = req.body
    if (otp == generatedOTP) {
        if (tempUser.email) {
            await User.create(tempUser)
            tempUser = {}
        }
        if (resetemail) {
            await User.updateOne(
                { email: resetemail },
                { password: tempUser.password }
            )
            resetemail = ""
        }
        generatedOTP = ""
        return res.redirect("/login.html")
    } else {
        res.send(`
            <script>
               alert("Invalid OTP")
               window.location.href="/otp.html"
            </script>`)
    }
})
app.post("/login", async (req, res) => {
    try {

        const { email, password } = req.body

        const user = await User.findOne({ email })

        if (!user) {
            return res.json({ success: false, message: "User not found" })
        }

        if (user.password != password) {
            return res.json({ success: false, message: "Invalid password" })
        }

        res.json({ success: true, email })

    } catch (err) {
        console.log("LOGIN ERROR:", err)
        res.status(500).json({ success: false, message: "Server error" })
    }
})
app.get("/", (req, res) => {
    res.redirect("/login.html")
})
app.get("/login", (req,res)=>{
    res.redirect("/login.html")
})
app.post("/resetpassword", async (req, res) => {
    const { email, newpassword, newpasswordagain } = req.body
    const user = await User.findOne({ email })
    if (!user) {
        return res.send(`
            <script>
                alert("Incorrect email")
                window.location.href="/newpassword.html"
            </script>`)
    }
    if (newpassword != newpasswordagain) {
        return res.send(`
            <script>
                alert("Passwords doesn't match")
                window.location.href="/newpassword.html"
            </script>`)
    }
    generatedOTP = Math.floor(100000 + Math.random() * 900000).toString()
    resetemail = email
    tempUser = {
        password: newpassword
    }
    await transporter.sendMail({
        from: "phani005.setty@gmail.com",
        to: email,
        subject: "Password reset otp",
        text: "Your otp is: " + generatedOTP
    })
    res.redirect("/otp.html")
})
//Group creation
app.post("/create-group", upload.single("photo"), async (req, res) => {

    const { groupName, members, admin } = req.body

    let memberList = members.split(",").map(e => e.trim())

    // Add admin automatically
    if (!memberList.includes(admin)) {
        memberList.push(admin)
    }

    const newGroup = await Group.create({
        name: groupName,
        members: memberList,
        admin,
        profileimage: req.file ? req.file.path : ""
    })

    res.json({ success: true })
})
app.post("/addcontact", async (req, res) => {
    const { ownerEmail, contactEmail, contactName } = req.body
    const user = await User.findOne({ email: ownerEmail })
    const contactUser = await User.findOne({ email: contactEmail })
    if (!contactUser) {
        return res.json({ success: false, message: "User not found" })
    }
    const alreadyExists = user.contacts.some(
        contact => contact.email === contactEmail
    )

    if (alreadyExists) {
        return res.json({ success: false, message: "Contact already added" })
    }

    user.contacts.push({
        name: contactName,
        email: contactEmail
    })
    await user.save()
    res.json({ success: true })
})
app.get("/getcontacts/:email", async (req, res) => {

    const user = await User.findOne({ email: req.params.email })
    const contactswithdp = []
    for (let contact of user.contacts) {
        const contactUser = await User.findOne({ email: contact.email })
        contactswithdp.push({
            name: contact.name,
            email: contact.email,
            profileimage: contactUser ? contactUser.profileimage : null
        })
    }
    console.log("contacts with dp: ", contactswithdp)
    res.json(contactswithdp)
})
app.get("/get-profile/:email", async (req, res) => {

    const user = await User.findOne({ email: req.params.email })

    if (!user) return res.json({ success: false })
    res.json({
        username: user.username,
        email: user.email,
        profileimage: user.profileimage
    })
})
app.post("/change-my-name", async (req, res) => {

    try {

        const { email, newName } = req.body

        if (!email || !newName) {
            return res.status(400).json({ success: false })
        }

        const updatedUser = await User.findOneAndUpdate(
            { email: email },
            { username: newName },
            { new: true }
        )

        if (!updatedUser) {
            return res.status(404).json({ success: false })
        }

        res.json({ success: true })

    } catch (error) {
        console.log("Error updating name:", error)
        res.status(500).json({ success: false })
    }
})
app.get("/conversations/:email", async (req, res) => {

    const userEmail = req.params.email
    const user = await User.findOne({ email: userEmail })
    if (!user) return res.json([])

    const resultMap = new Map()
    const result = []

    // 🔹 Get all private messages
    const privateMessages = await Message.find({
        isGroup: false,
        hiddenFor: { $ne: userEmail },
        $or: [
            { from: userEmail },
            { to: userEmail }
        ]
    }).sort({ timestamp: -1 })

    // 🔹 Store latest message per user
    for (let msg of privateMessages) {

        const otherUser =
            msg.from === userEmail ? msg.to : msg.from

        if (!resultMap.has(otherUser)) {
            resultMap.set(otherUser, msg)
        }
    }

    // 🔹 Add conversations (saved + unsaved)
    for (let [email, lastMessage] of resultMap) {

        const otherUser = await User.findOne({ email })
        const savedContact = user.contacts.find(c => c.email === email)
        const unreadCount = await Message.countDocuments({
            from: email,
            to: userEmail,
            seen: false,
            hiddenFor:{$ne:userEmail}
        })

        result.push({
            email,
            name: savedContact
                ? savedContact.name
                : (otherUser ? otherUser.username : email),
            profileimage: otherUser ? otherUser.profileimage : null,
            lastMessage: lastMessage.message,
            unread: unreadCount,
            isSavedContact: !!savedContact
        })
    }

    // 🔹 Add saved contacts without messages
    for (let contact of user.contacts) {

        if (!resultMap.has(contact.email)) {

            const otherUser = await User.findOne({ email: contact.email })

            result.push({
                email: contact.email,
                name: contact.name,
                profileimage: otherUser ? otherUser.profileimage : null,
                lastMessage: "",
                isSavedContact: true
            })
        }
    }

    // 🔹 Add groups
    const groups = await Group.find({ members: userEmail })

    for (let group of groups) {

        const lastGroupMessage = await Message.findOne({
            groupId: group._id,
            isGroup: true
        }).sort({ timestamp: -1 })

        result.push({
            email: group._id,
            name: group.name,
            profileimage: group.profileimage,
            lastMessage: lastGroupMessage ? lastGroupMessage.message : "",
            isGroup: true
        })
    }

    res.json(result)
})
app.post("/changename", async (req, res) => {

    const { ownerEmail, contactEmail, newName } = req.body

    const result = await User.updateOne(
        { email: ownerEmail, "contacts.email": contactEmail },
        { $set: { "contacts.$.name": newName } }
    )
    console.log("Update results: ", result)
    res.json({ success: true })
})
app.post("/changedp", upload.single("photo"), async (req, res) => {

    const { email } = req.body

    await User.updateOne(
        { email: email },
        { profileimage: req.file.path }
    )

    res.redirect("/main.html")
})
app.post("/deletecontact", async (req, res) => {

    const { ownerEmail, contactEmail } = req.body

    // Remove from contacts
    await User.updateOne(
        { email: ownerEmail },
        { $pull: { contacts: { email: contactEmail } } }
    )

    // Hide conversation for that user
    await Message.updateMany(
        {
            $or: [
                { from: ownerEmail, to: contactEmail },
                { from: contactEmail, to: ownerEmail }
            ]
        },
        { $addToSet: { hiddenFor: ownerEmail } }
    )

    res.json({ success: true })
})
app.post("/upload-message", upload.single("file"), async (req, res) => {

    const { from, to, type, isGroup } = req.body

    const fileUrl = req.file.path   // ✅ CLOUDINARY URL

    let newMessage

    if (isGroup === "true") {

        newMessage = await Message.create({
            from,
            message: fileUrl,
            type,
            isGroup: true,
            groupId: to
        })

        const group = await Group.findById(to)

        for (let member of group.members) {
            const sockets = onlineUsers[member]
            if (sockets) {
                sockets.forEach(id => {
                    io.to(id).emit("receive-message", newMessage)
                })
            }
        }

    } else {

        newMessage = await Message.create({
            from,
            to,
            message: fileUrl,
            type
        })

        const receiverSockets = onlineUsers[to]

        if (receiverSockets) {
            newMessage.delivered = true
            await newMessage.save()

            receiverSockets.forEach(id => {
                io.to(id).emit("receive-message", newMessage)
            })
        }

        const senderSockets = onlineUsers[from]

        if (senderSockets) {
            senderSockets.forEach(id => {
                io.to(id).emit("receive-message", newMessage)
            })
        }
    }

    res.json(newMessage)
})
app.post("/toggle-block", async (req, res) => {
    const { userEmail, targetEmail } = req.body

    const user = await User.findOne({ email: userEmail })

    const isBlocked = user.blockedUsers.includes(targetEmail)

    if (isBlocked) {
        user.blockedUsers.pull(targetEmail)
    } else {
        user.blockedUsers.push(targetEmail)
    }

    await user.save()

    res.json({ blocked: !isBlocked })
})
app.post("/clear-chat", async (req, res) => {
    const { user1, user2 } = req.body

    await Message.updateMany(
        {
            $or: [
                { from: user1, to: user2 },
                { from: user2, to: user1 }
            ]
        },
        { $addToSet: { deletedFor: user1 } }
    )

    res.json({ success: true })
})
app.post("/delete-messages", async (req, res) => {
    const { messageIds, userEmail } = req.body

    await Message.updateMany(
        { _id: { $in: messageIds } },
        { $addToSet: { deletedFor: userEmail } }
    )

    res.json({ success: true })
})
app.post("/delete-for-everyone", async (req, res) => {

    const { messageIds } = req.body

    const messages = await Message.find({ _id: { $in: messageIds } })

    await Message.updateMany(
        { _id: { $in: messageIds } },
        {
            deletedForEveryone: true,
            message: "This message was deleted"
        }
    )

    // 🔥 Emit to both users
    messages.forEach(msg => {

        if (msg.isGroup) {
            io.emit("message-deleted", { messageId: msg._id })
        } else {
            const senderSocket = onlineUsers[msg.from]
            const receiverSocket = onlineUsers[msg.to]

            if (senderSocket)
                io.to(senderSocket).emit("message-deleted", { messageId: msg._id })

            if (receiverSocket)
                io.to(receiverSocket).emit("message-deleted", { messageId: msg._id })
        }
    })

    res.json({ success: true })
})
io.on("connection", (socket) => {
    console.log("New user connected: ", socket.id)
    socket.on("register-user", async (email) => {
        socket.userEmail = email
        if (!onlineUsers[email]) {
            onlineUsers[email] = []
        }

        onlineUsers[email].push(socket.id)
        console.log("Online users: ", onlineUsers)
        const undelivered = await Message.find({
            to: email,
            delivered: false
        }).sort({ timestamp: 1 })
        for (let msg of undelivered) {
            // socket.emit("receive-message", {
            //     from: msg.from,
            //     message: msg.message,
            //     timestamp: msg.timestamp
            // })
            msg.delivered = true
            await msg.save()
            socket.emit("receive-message", msg)
        }
    })
    socket.on("private-message", async ({ to, from, message }) => {

        const sender = await User.findOne({ email: from })

        if (!sender) {
            console.log("Sender not found")
            return
        }

        if (sender.blockedUsers && sender.blockedUsers.includes(to)) {
            console.log("Message blocked")
            return
        }

        const newMessage = await Message.create({
            from,
            to,
            message
        })

        const receiverSocketId = onlineUsers[to]
        const senderSocketId = onlineUsers[from]

        if (receiverSocketId) {
            newMessage.delivered = true
            await newMessage.save()
            io.to(receiverSocketId).emit("receive-message", newMessage)
        }

        if (senderSocketId) {
            io.to(senderSocketId).emit("receive-message", newMessage)
        }
    })
    socket.on("group-message", async ({ groupId, from, message }) => {

        if (!mongoose.Types.ObjectId.isValid(groupId)) return

        const group = await Group.findById(groupId)
        if (!group) return

        const newMessage = await Message.create({
            from,
            message,
            isGroup: true,
            groupId
        })

        for (let member of group.members) {
            const memberSocket = onlineUsers[member]
            if (memberSocket) {
                io.to(memberSocket).emit("receive-message", newMessage)
            }
        }
    })
    socket.on("mark-seen", async ({ from, to }) => {
        await Message.updateMany({
            from: from,
            to: to,
            seen: false
        }, {
            seen: true
        })
        const senderSocketId = onlineUsers[from]
        if (senderSocketId) {
            io.to(senderSocketId).emit("messages-seen", {
                from,
                to
            })
        }
    })
    socket.on("disconnect", () => {

        for (let email in onlineUsers) {

            onlineUsers[email] = onlineUsers[email].filter(
                id => id !== socket.id
            )

            if (onlineUsers[email].length === 0) {
                delete onlineUsers[email]
            }

        }

    })
    // User calling someone
    socket.on("call-user", ({ to, offer, from, type }) => {

        const receiverSockets = onlineUsers[to]

        if (receiverSockets) {
            receiverSockets.forEach(id => {
                io.to(id).emit("incoming-call", {
                    from,
                    offer,
                    type
                })
            })
        }
    })

    // Receiver answering call
    socket.on("answer-call", ({ to, answer }) => {
        const callerSocket = onlineUsers[to]
        console.log("caller socket: ", callerSocket)
        console.log("caller socket to: ", to)
        console.log("caller socket answer: ", answer)
        console.log("caller online users: ", onlineUsers)

        if (callerSocket) {
            // io.to(callerSocket).emit("call-answered", {
            //     answer
            // })
            // callerSocket.forEach(id => {
            //     io.to(id).emit("call-answered", { answer })
            // })
            callerSocket.forEach(id => {
                io.to(id).emit("call-answered", {
                    from: socket.userEmail,
                    answer
                })
            })
        }
    })

    // ICE candidate exchange
    socket.on("ice-candidate", ({ to, candidate }) => {
        const receiverSocket = onlineUsers[to]
        console.log("receiver onlineuser: ", onlineUsers)
        console.log("ReceiverSocket: ", receiverSocket)
        console.log("receiver to: ", to)
        console.log("receiver candidate: ", candidate)

        if (receiverSocket) {
            // io.to(receiverSocket).emit("ice-candidate", {
            //     candidate
            // })
            receiverSocket.forEach(id => {
                io.to(id).emit("ice-candidate", { candidate })
            })
        }
    })
    socket.on("end-call", async ({ to, from, type, duration }) => {

        const receiverSocket = onlineUsers[to]

        if (receiverSocket) {
            receiverSocket.forEach(id => {
                io.to(id).emit("call-ended")
            })
        }

        await Call.create({
            caller: from,
            receiver: to,
            type: type,
            duration: duration,
            timestamp: new Date()
        })

    })
    socket.on("missed-call", async ({ to, from, type }) => {

        await Call.create({
            caller: from,
            receiver: to,
            type: type,
            duration: 0,
            missed: true,
            timestamp: new Date()
        })

    })
    // GROUP CALL START
    socket.on("group-call", async ({ groupId, from, type }) => {

        const group = await Group.findById(groupId)

        if (!group) return

        group.members.forEach(member => {

            if (member === from) return

            const sockets = onlineUsers[member]

            if (sockets) {
                sockets.forEach(id => {

                    io.to(id).emit("incoming-group-call", {
                        from,
                        groupId,
                        type
                    })

                })
            }

        })

    })
    // GROUP CALL ANSWER
    socket.on("group-answer", ({ to, answer }) => {

        const callerSocket = onlineUsers[to]

        if (callerSocket) {
            callerSocket.forEach(id => {
                io.to(id).emit("group-call-answered", { answer })
            })
        }

    })
    socket.on("join-group-call", ({ groupId, user }) => {

        socket.join(groupId)

        socket.to(groupId).emit("user-joined-call", {
            user
        })

    })
})
app.get("/group-members/:groupId/:viewerEmail", async (req, res) => {

    const { groupId, viewerEmail } = req.params

    const group = await Group.findById(groupId)

    if (!group) return res.json([])

    const viewer = await User.findOne({ email: viewerEmail })

    const result = []

    for (let email of group.members) {

        const user = await User.findOne({ email })

        if (!user) continue

        // check saved contact name
        let displayName = user.username

        const savedContact = viewer.contacts.find(c => c.email === email)

        if (savedContact) {
            displayName = savedContact.name
        }

        result.push({
            name: displayName,
            email: email,
            profileimage: user.profileimage,
            isAdmin: group.admin === email
        })
    }

    res.json({
        groupName: group.name,
        members: result
    })

})
app.get("/messages/:user1/:chatId", async (req, res) => {

    const { user1, chatId } = req.params
    const isGroup = req.query.isGroup === "true"
    if (isGroup) {

        const group = await Group.findById(chatId)
        if (!group) return res.json({ messages: [] })

        const messages = await Message.find({
            isGroup: true,
            groupId: chatId
        }).sort({ timestamp: 1 })

        return res.json({
            messages,
            displayName: group.name,
            profileimage: group.profileimage
        })
    }

    // ---------------- PRIVATE CHAT ----------------
    const messages = await Message.find({
        $or: [
            { from: user1, to: chatId },
            { from: chatId, to: user1 }
        ],
        deletedFor: { $ne: user1 }
    }).sort({ timestamp: 1 })

    const otherUser = await User.findOne({ email: chatId })
    const user = await User.findOne({ email: user1 })

    let displayName = chatId
    let isSavedContact = false
    if (user) {
        const contact = user.contacts.find(c => c.email === chatId)
        if (contact) {
            displayName = contact.name
            isSavedContact = true
        } else if (otherUser) {
            displayName = otherUser.username
        }
    }

    res.json({
        messages,
        displayName,
        profileimage: otherUser ? otherUser.profileimage : null,
        isSavedContact
    })
})
app.get("/calls/:email", async (req, res) => {

    const email = req.params.email

    const calls = await Call.find({
        $or: [
            { caller: email },
            { receiver: email }
        ]
    }).sort({ timestamp: -1 })

    const result = []

    for (const call of calls) {

        let direction = ""
        let other = ""

        if (call.caller === email) {
            direction = "outgoing"
            other = call.receiver
        } else {
            direction = "incoming"
            other = call.caller
        }

        let name = other
        let profileimage = null

        let group = null

        if (mongoose.Types.ObjectId.isValid(other)) {
            group = await Group.findById(other)
        }

        if (group) {

            name = group.name
            profileimage = group.profileimage

        } else {

            const user = await User.findOne({ email: other })

            if (user) {
                name = user.username
                profileimage = user.profileimage
            }

        }

        result.push({
            name: name,
            profileimage: profileimage,
            type: call.type,
            direction: direction,
            duration: call.duration,
            time: call.timestamp,
            missed:call.missed
        })

    }

    res.json(result)

})
httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at localhost ${PORT}`)
})
