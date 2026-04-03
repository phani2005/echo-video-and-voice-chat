import express from "express"
import mongoose from "mongoose"
import multer from "multer"
// import nodemailer from "nodemailer"
import { createServer } from "http"
import { Server } from "socket.io"
import { type } from "os"
import dotenv from "dotenv"
import cors from "cors"
import { v2 as cloudinary } from "cloudinary"
import { CloudinaryStorage } from "multer-storage-cloudinary"
import fs from "fs"
import dns from "dns"
import webpush from "web-push"

webpush.setVapidDetails(
    "mailto:phani005.setty@gmail.com",
    "BGBN28y8CEWU4UHdBgaOZcSBFThn8YkbScCRogRVy_sHzO_q66kfBS-sVlUr6QiE7TM7X3iRU1krbfVAuJhhOIM",
    "9oLUb-nprcf1PJxIrqTjaXz9oI6dMsliEXVwb1oQRQU"
)

// let subscriptions = []
const activeUsers = {}
const activeCalls = {} // 🔥 store active calls
const activeChats = {}
const notificationBuffer = {} // 🔥 ADD THIS
// import {Resend} from "resend"
dns.setDefaultResultOrder("ipv4first")
dotenv.config()
// const resend = new Resend(process.env.RESEND_API_KEY)
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
const PORT = process.env.PORT || 5000
try {
    await mongoose.connect(process.env.MONGO_URL)
    console.log("Mongodb is connected successfully")
} catch (err) {
    console.log("MONGO ERROR:", err)
}
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
    replyTo: {
        messageId: String,
        text: String,
        from: String
    },
    type: { type: String, default: "text" },

    isGroup: { type: Boolean, default: false },
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Group"
    },

    timestamp: { type: Date, default: Date.now },
    delivered: { type: Boolean, default: false },
    seen: { type: Boolean, default: false },
    originalName: String,
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
const subscriptionSchema = new mongoose.Schema({
    email: String,
    sub: Object
})

const Subscription = mongoose.model("Subscription", subscriptionSchema)
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {

        let resourceType = "auto"

        // if (file.mimetype === "application/pdf") {
        //     resourceType = "raw"
        // }
        // else if (file.mimetype.includes("word") || file.mimetype.includes("officedocument")) {
        //     resourceType = "raw"
        // }
        // else if (file.mimetype === "text/plain") {
        //     resourceType = "raw"
        // }
        if (file.mimetype.startsWith("video")) {
            resourceType = "video"
        }
        else if (file.mimetype.startsWith("image")) {
            resourceType = "image"
        } else if (
            file.mimetype === "application/pdf" ||
            file.mimetype.includes("word") ||
            file.mimetype.includes("officedocument") ||
            file.mimetype === "text/plain"
        ) {
            resourceType = "raw"
        }
        else {
            resourceType = "auto"
        }

        return {
            folder: "chat-app",
            resource_type: resourceType,
            // format: file.mimetype === "application/pdf" ? "pdf" : undefined,
            public_id: Date.now() + "-" + file.originalname.replace(/\.[^/.]+$/, ""),
            // type: "upload",
            access_mode: "public"
        }
    }
})
const upload = multer({ storage: storage })
let tempUser = {}
let generatedOTP = ""
let resetemail = ""
app.post("/register", upload.single("photo"), async (req, res) => {
    try {

        const { username, email, password } = req.body

        const existingUser = await User.findOne({ email })
        if (existingUser) {
            return res.json({ success: false, message: "User already exists" })
        }

        let imageUrl = ""

        // Upload to cloudinary
        if (req.file) {
            imageUrl = req.file.path   // already cloudinary URL
        }

        await User.create({
            username,
            email,
            password,
            profileimage: imageUrl
        })

        console.log("USER REGISTERED:", email)

        res.json({ success: true })

    } catch (err) {
        console.log("REGISTER ERROR:", err)
        res.json({ success: false, message: "Server error" })
    }
})
// app.post("/verify-otp", async (req, res) => {
//     const { otp } = req.body
//     if (otp == generatedOTP) {
//         if (tempUser.email) {
//             await User.create(tempUser)
//             tempUser = {}
//         }
//         if (resetemail) {
//             await User.updateOne(
//                 { email: resetemail },
//                 { password: tempUser.password }
//             )
//             resetemail = ""
//         }
//         generatedOTP = ""
//         return res.redirect("/login.html")
//     } else {
//         res.send(`
//             <script>
//                alert("Invalid OTP")
//                window.location.href="/otp.html"
//             </script>`)
//     }
// })
app.post("/subscribe", async (req, res) => {

    const { email, subscription } = req.body

    try {

        const exists = await Subscription.findOne({
            email,
            "sub.endpoint": subscription.endpoint
        })

        if (!exists) {
            await Subscription.create({
                email,
                sub: subscription
            })
            console.log("📱 NEW DEVICE ADDED:", email)
        } else {
            console.log("⚡ Already subscribed:", email)
        }

        res.json({ success: true })

    } catch (err) {
        console.log("SUBSCRIBE ERROR:", err)
        res.status(500).json({ success: false })
    }
})
async function sendCallNotification({ toUsers, title, body, data }) {

    for (let user of toUsers) {

        const subs = await Subscription.find({ email: user })

        subs.forEach(s => {
            webpush.sendNotification(
                s.sub,
                JSON.stringify({
                    title,
                    body,
                    ...data
                })
            ).catch(err => {
                console.log("❌ Push error:", err.message)
            })
        })
    }
}
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
app.get("/login", (req, res) => {
    res.redirect("/login.html")
})

app.post("/create-group", upload.single("photo"), async (req, res) => {

    const { groupName, members, admin } = req.body

    // 🔥 SPLIT INPUT
    let inputList = members.split(",").map(e => e.trim().toLowerCase())

    // 🔥 GET ADMIN USER
    const adminUser = await User.findOne({ email: admin })

    let finalMembers = []

    for (let input of inputList) {

        if (input.includes("@")) {
            finalMembers.push(input)
        } else {
            const foundContact = adminUser.contacts.find(
                c => c.name.toLowerCase() === input
            )

            if (foundContact) {
                finalMembers.push(foundContact.email)
            } else {
                console.log("❌ Contact not found:", input)
            }
        }
    }

    // 🔥 REMOVE DUPLICATES
    finalMembers = [...new Set(finalMembers)]

    // 🔥 ADD ADMIN
    if (!finalMembers.includes(admin)) {
        finalMembers.push(admin)
    }

    const newGroup = await Group.create({
        name: groupName,
        members: finalMembers,
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
            hiddenFor: { $ne: userEmail }
        })

        result.push({
            email,
            name: savedContact
                ? savedContact.name
                : (otherUser ? otherUser.username : email),
            profileimage: otherUser ? otherUser.profileimage : null,
            lastMessage: lastMessage.message,
            lastMessageTime: lastMessage.timestamp,
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
            lastMessageTime: lastGroupMessage ? lastGroupMessage.timestamp : null,
            isGroup: true
        })
    }
    // 🔥 SORT BY LATEST MESSAGE TIME
    result.sort((a, b) => {

        const timeA = a.lastMessageTime ? new Date(a.lastMessageTime) : 0
        const timeB = b.lastMessageTime ? new Date(b.lastMessageTime) : 0

        return timeB - timeA
    })

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
async function getDisplayName(viewerEmail, senderEmail) {

    const viewer = await User.findOne({ email: viewerEmail })

    if (viewer) {
        const saved = viewer.contacts.find(c => c.email === senderEmail)
        if (saved) return saved.name
    }

    const sender = await User.findOne({ email: senderEmail })
    return sender ? sender.username : senderEmail
}
app.post("/upload-message", upload.single("file"), async (req, res) => {
    try {

        if (!req.file) {
            return res.status(400).json({ error: "File upload failed" })
        }

        const { from, to, type, isGroup, originalName } = req.body
        let fileType = "file"

        if (req.file.mimetype === "application/pdf") {
            fileType = "pdf"
        }
        else if (
            req.file.mimetype.includes("word") ||
            req.file.mimetype.includes("officedocument")
        ) {
            fileType = "word"
        }
        else if (req.file.mimetype === "text/plain") {
            fileType = "text"
        }
        else if (req.file.mimetype.startsWith("image")) {
            fileType = "image"
        }
        else if (req.file.mimetype.startsWith("video")) {
            fileType = "video"
        }
        else if (req.file.mimetype.startsWith("audio")) {
            fileType = "audio"
        }

        const fileName = req.file.path

        let newMessage

        if (isGroup === "true") {

            newMessage = await Message.create({
                from,
                message: fileName,
                type: fileType,
                originalName: req.file.originalname,
                isGroup: true,
                groupId: to
            })

            const group = await Group.findById(to)

            for (let member of group.members) {
                const memberSocket = onlineUsers[member]
                if (memberSocket) {
                    io.to(memberSocket).emit("receive-message", newMessage)
                }
                // 🔥 GROUP FILE NOTIFICATION
                const isInSameGroup =
                    activeChats[member] &&
                    activeChats[member].chatId == to &&
                    activeChats[member].isGroup === true

                if (member !== from && !isInSameGroup) {
                    let bodyText = "Document received"

                    if (fileType === "image") bodyText = "📷 Image in group"
                    else if (fileType === "video") bodyText = "🎥 Video in group"
                    else if (fileType === "audio") bodyText = "🎧 Audio in group"
                    else bodyText = "📄 File in group"

                    const subs = await Subscription.find({ email: member })
                    const groupname = group.name
                    // const senderUser = await User.findOne({ email: from })

                    // const senderName = senderUser
                    //     ? senderUser.username
                    //     : from
                    const senderName = await getDisplayName(member, from)


                    subs.forEach(s => {
                        webpush.sendNotification(
                            s.sub,
                            JSON.stringify({
                                title: groupname,
                                body: `${senderName}:${bodyText}`,
                                url: "/chat.html",
                                from: to,
                                type: "group",
                                isGroup: true
                            })
                        ).catch(err => {
                            console.log("❌ Push error:", err.message)
                        })
                    })
                }
            }

        } else {

            newMessage = await Message.create({
                from,
                to,
                message: fileName,
                originalName,
                type: fileType
            })

            const receiverSocketId = onlineUsers[to]

            if (receiverSocketId) {
                newMessage.delivered = true
                await newMessage.save()
                io.to(receiverSocketId).emit("receive-message", newMessage)
            }

            const senderSocketId = onlineUsers[from]
            if (senderSocketId) {
                io.to(senderSocketId).emit("receive-message", newMessage)
            }
            // 🔥 PUSH NOTIFICATION FOR FILES
            const isInSameChat =
                activeChats[to] &&
                activeChats[to].chatId === from &&
                activeChats[to].isGroup === false

            if (!isInSameChat) {

                let bodyText = "Document received"

                if (fileType === "image") bodyText = "📷 Image received"
                else if (fileType === "video") bodyText = "🎥 Video received"
                else if (fileType === "audio") bodyText = "🎧 Audio received"
                else if (fileType === "pdf" || fileType === "word" || fileType === "text") bodyText = "📄 Document received"

                const subs = await Subscription.find({ email: to })
                const senderUser = await User.findOne({ email: from })

                const senderName = await getDisplayName(to, from)

                subs.forEach(s => {
                    webpush.sendNotification(
                        s.sub,
                        JSON.stringify({
                            title: senderName,
                            body: bodyText,
                            url: "/chat.html",
                            from: from,
                            type: "file"
                        })
                    ).catch(err => {
                        console.log("❌ Push error:", err.message)
                    })
                })
            }
        }

        res.json(newMessage)

    } catch (error) {
        console.error("Upload error:", error)
        res.status(500).json({ error: "Upload failed" })
    }
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

    // 🔥 FILTER ONLY SENDER MESSAGES
    const validMessages = messages.filter(msg => msg.from === req.body.userEmail)

    const validIds = validMessages.map(m => m._id)

    if (validIds.length === 0) {
        return res.json({ success: false })
    }

    await Message.updateMany(
        { _id: { $in: validIds } },
        { $set: { deletedForEveryone: true } }
    )

    validMessages.forEach(msg => {

        if (msg.isGroup) {
            io.emit("message-deleted", { messageId: msg._id })
        } else {

            const senderSockets = onlineUsers[msg.from]
            const receiverSockets = onlineUsers[msg.to]

            if (senderSockets) {
                senderSockets.forEach(id =>
                    io.to(id).emit("message-deleted", { messageId: msg._id })
                )
            }

            if (receiverSockets) {
                receiverSockets.forEach(id =>
                    io.to(id).emit("message-deleted", { messageId: msg._id })
                )
            }
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
    socket.on("private-message", async ({ to, from, message, replyTo }) => {

        const sender = await User.findOne({ email: from })

        if (!sender) {
            console.log("Sender not found")
            return
        }

        if (sender.blockedUsers && sender.blockedUsers.includes(to)) {
            console.log("Message blocked")
            return
        }

        let replyData = null

        if (replyTo) {
            const replyName = await getDisplayName(from, replyTo.from)

            replyData = {
                messageId: replyTo.messageId,
                text: replyTo.text,
                from: replyTo.from,
                name: replyName   // 🔥 ADD THIS
            }
        }

        const newMessage = await Message.create({
            from,
            to,
            message,
            replyTo: replyData
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
        // 🔥 SEND NOTIFICATION ONLY IF USER OFFLINE
        let bodyText = message

        // emoji support already works automatically

        const subs = await Subscription.find({ email: to })
        const senderUser = await User.findOne({ email: from })

        const senderName = await getDisplayName(to, from)

        const isInSameChat =
            activeChats[to] &&
            activeChats[to].chatId === from &&
            activeChats[to].isGroup === false

        if (!isInSameChat) {

            // const key = `${to}_${from}`

            const key = `${to}_${from}`

            if (!notificationBuffer[key]) {
                notificationBuffer[key] = {
                    messages: [],
                    timer: null
                }
            }

            notificationBuffer[key].messages.push(bodyText)
            notificationBuffer[key].messages =
                notificationBuffer[key].messages.slice(-5)

            // 🔥 CLEAR OLD TIMER
            if (notificationBuffer[key].timer) {
                clearTimeout(notificationBuffer[key].timer)
            }

            // 🔥 DELAY SEND (IMPORTANT)
            notificationBuffer[key].timer = setTimeout(async () => {

                const msgs = notificationBuffer[key].messages

                subs.forEach(s => {
                    webpush.sendNotification(
                        s.sub,
                        JSON.stringify({
                            title: senderName,
                            body: msgs[msgs.length - 1],
                            messages: msgs,
                            url: "/chat.html",
                            from: from,
                            type: "message",
                            isGroup: false
                        })
                    ).catch(err => {
                        console.log("❌ Push error:", err.message)
                    })
                })

                notificationBuffer[key].timer = null

            }, 1500) // 🔥 1.5 sec delay

        }
    })
    socket.on("group-message", async ({ groupId, from, message, replyTo }) => {

        if (!mongoose.Types.ObjectId.isValid(groupId)) return

        const group = await Group.findById(groupId)
        if (!group) return

        const newMessage = await Message.create({
            from,
            message,
            isGroup: true,
            groupId,
            replyTo
        })

        for (let member of group.members) {
            const memberSocket = onlineUsers[member]
            if (memberSocket) {
                io.to(memberSocket).emit("receive-message", newMessage)
            }
            const isInSameGroup =
                activeChats[member] &&
                activeChats[member].chatId == groupId &&
                activeChats[member].isGroup === true

            if (isInSameGroup) {
                const key = `${member}_${groupId}`
                if (notificationBuffer[key]) {
                    notificationBuffer[key].messages = []
                }
            }
        }
        // 🔥 GROUP TEXT NOTIFICATION
        for (let member of group.members) {

            if (member === from) continue

            const isInSameGroup =
                activeChats[member] &&
                activeChats[member].chatId == groupId &&
                activeChats[member].isGroup === true

            if (!isInSameGroup) {

                const subs = await Subscription.find({ email: member })
                const senderUser = await User.findOne({ email: from })
                const groupname = group.name

                const senderName = await getDisplayName(member, from)

                const key = `${member}_${groupId}`

                if (!notificationBuffer[key]) {
                    notificationBuffer[key] = {
                        messages: [],
                        timer: null
                    }
                }

                notificationBuffer[key].messages.push(`${senderName}: ${message}`)
                notificationBuffer[key].messages =
                    notificationBuffer[key].messages.slice(-5)

                if (notificationBuffer[key].timer) {
                    clearTimeout(notificationBuffer[key].timer)
                }

                notificationBuffer[key].timer = setTimeout(() => {

                    const msgs = notificationBuffer[key].messages

                    subs.forEach(s => {
                        webpush.sendNotification(
                            s.sub,
                            JSON.stringify({
                                title: groupname,
                                body: msgs[msgs.length - 1],
                                messages: msgs,
                                url: "/chat.html",
                                from: groupId,
                                type: "group",
                                name: groupname,
                                isGroup: true
                            })
                        ).catch(err => {
                            console.log("❌ Push error:", err.message)
                        })
                    })

                    notificationBuffer[key].timer = null

                }, 1500)
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
        // 🔥 CLEAR NOTIFICATION BUFFER (IMPORTANT)
        const key = `${to}_${from}`
        if (notificationBuffer[key]) {
            notificationBuffer[key].messages = []
        }
        const senderSocketId = onlineUsers[from]
        if (senderSocketId) {
            io.to(senderSocketId).emit("messages-seen", {
                from,
                to
            })
        }
    })
    socket.on("group-seen", ({ groupId, user }) => {

        console.log("👀 Group seen:", groupId, user)

        const key = `${user}_${groupId}`

        if (notificationBuffer[key]) {
            notificationBuffer[key].messages = []
        }

    })
    socket.on("leave-chat", (user) => {
        delete activeChats[user]
    })
    socket.on("disconnect", () => {

        console.log("❌ Disconnected:", socket.userEmail)

        // ✅ REMOVE FROM ONLINE USERS
        for (let email in onlineUsers) {

            onlineUsers[email] = onlineUsers[email].filter(
                id => id !== socket.id
            )

            if (onlineUsers[email].length === 0) {
                delete onlineUsers[email]
            }

        }

        // 🔥 REMOVE FROM ACTIVE CALLS
        for (let groupId in activeCalls) {

            const call = activeCalls[groupId]

            if (call.users.includes(socket.userEmail)) {

                call.users = call.users.filter(u => u !== socket.userEmail)

                console.log("👤 Removed from call:", socket.userEmail)

                // ✅ DELETE CALL IF EMPTY
                if (call.users.length === 0) {
                    delete activeCalls[groupId]
                    console.log("🗑️ Call removed:", groupId)
                }
            }
        }

    })
    // User calling someone
    socket.on("call-user", async ({ to, offer, from, type, isGroupCall, isInitialCall }) => {
        console.log("call-user function from server")
        console.log("call-user to: ", to, " from: ", from, " type: ", type, " offer: ", offer)

        const receiverSockets = onlineUsers[to]
        console.log("call-user receiversockets: ", receiverSockets)

        if (receiverSockets) {
            receiverSockets.forEach(id => {
                io.to(id).emit("incoming-call", {
                    from,
                    offer: offer || null,
                    type
                })
            })
        }
        if (isGroupCall || type === "video") return
        let callTypeText = type === "video" ? "📹 Video Call" : "📞 Voice Call"

        const isInSameChat =
            activeChats[to] &&
            activeChats[to].chatId === from &&
            activeChats[to].isGroup === false

        if (!isInSameChat) {

            const subs = await Subscription.find({ email: to })
            const senderName = await getDisplayName(to, from)

            subs.forEach(s => {
                webpush.sendNotification(
                    s.sub,
                    JSON.stringify({
                        title: "Incoming Call",
                        body: callTypeText + " from " + senderName,
                        url: type === "video"
                            ? "/videocall.html"
                            : "/voicechat.html",
                        from: from,
                        type: type,
                        isGroup: false
                    })
                ).catch(err => {
                    console.log("❌ Push error:", err.message)
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
            callerSocket.forEach(id => {
                io.to(id).emit("call-answered", {
                    from: socket.userEmail,
                    answer
                })
            })
        }
    })
    socket.on("voice-call-start", async ({ to, from, type }) => {

        console.log("📞 voice-call-start:", from, "→", to)

        // 🔥 CREATE ROOM LIKE GROUP CALL
        const roomId = [from, to].sort().join("-")

        activeCalls[roomId] = {
            users: [from] // 👈 VERY IMPORTANT
        }

        const receiverSockets = onlineUsers[to]

        // if (receiverSockets) {
        //     receiverSockets.forEach(id => {
        //         io.to(id).emit("incoming-call", {
        //             from,
        //             offer: null,
        //             type
        //         })
        //     })
        // }

        // 🔔 push notification
        const subs = await Subscription.find({ email: to })
        const senderName = await getDisplayName(to, from)

        subs.forEach(s => {
            webpush.sendNotification(
                s.sub,
                JSON.stringify({
                    title: "Incoming Call",
                    body: `📞 Voice call from ${senderName}`,
                    url: "/voicechat.html",
                    type: "voice",
                    from: from,
                    isGroup: false
                })
            ).catch(err => {
                console.log("❌ Push error:", err.message)
            })
        })
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
    //join-Call
    socket.on("join-call", ({ user1, user2 }) => {
        console.log("user joined call through server")
        console.log("users are ", user1, " and ", user2)

        const roomId = [user1, user2].sort().join("-")

        if (!activeCalls[roomId]) {
            activeCalls[roomId] = {
                users: []
            }
        }

        if (!activeCalls[roomId].users.includes(socket.userEmail)) {
            activeCalls[roomId].users.push(socket.userEmail)
        }

        // 🔥 Notify others (LIKE GROUP CALL)
        activeCalls[roomId].users.forEach(user => {

            if (user !== socket.userEmail) {

                const sockets = onlineUsers[user]

                if (sockets) {
                    sockets.forEach(id => {
                        io.to(id).emit("user-joined-call", {
                            user: socket.userEmail
                        })
                    })
                }

            }

        })

    })
    //end-call
    socket.on("end-call", async ({ to, from, type, duration }) => {

        const receiverSocket = onlineUsers[to]

        if (receiverSocket) {
            receiverSocket.forEach(id => {
                io.to(id).emit("call-ended", {
                    from: socket.userEmail
                })
            })
        }

        const roomId = [from, to].sort().join("-")
        delete activeCalls[roomId]


        await Call.create({
            caller: from,
            receiver: to,
            type: type,
            duration: duration,
            timestamp: new Date()
        })

    })
    socket.on("call-timeout", async ({ from, to, type, isGroup }) => {
        console.log("⏱️ Call timeout:", from, "→", to)
        if (isGroup) {

            const group = await Group.findById(to)

            if (!group) return

            const groupName = group.name

            // 🔥 SEND TO ALL MEMBERS
            await sendCallNotification({
                toUsers: group.members,   // ✅ ALL USERS
                title: "Missed Group Call",
                body: `Missed ${type} call in ${groupName} from ${from}`,
                data: {
                    from,
                    type,
                    status: "ended",
                    isGroup: true,
                    title: groupName   // 🔥 VERY IMPORTANT
                }
            })

            return   // 🔥 STOP NORMAL FLOW
        }


        // 🔥 NORMAL CALL
        await sendCallNotification({
            toUsers: [to],
            title: "Missed Call",
            body: `Missed ${type} call from ${from}`,
            data: {
                from,
                type,
                status: "ended",
                isGroup: false
            }
        })

        await Call.create({
            caller: from,
            receiver: to,
            type,
            duration: 0,
            missed: true
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
    socket.on("call-rejected", async ({ to, from }) => {

        console.log("❌ Call rejected:", from, "→", to)
        await sendCallNotification({
            toUsers: [to],
            title: "Missed Call",
            body: `Missed ${type} call from ${from}`,
            data: {
                from,
                type,
                status: "ended",
                isGroup: false
            }
        })

        const callerSockets = onlineUsers[to]

        if (callerSockets) {
            callerSockets.forEach(id => {
                io.to(id).emit("call-rejected", { from })
            })
        }

    })
    //active sockets
    socket.on("user-active", (email) => {
        activeUsers[email] = true
    })

    socket.on("user-inactive", (email) => {
        activeUsers[email] = false
    })
    //Request offer
    // socket.on("request-offer", ({ to, from }) => {

    //     const callerSockets = onlineUsers[to]

    //     if (callerSockets) {
    //         callerSockets.forEach(id => {
    //             io.to(id).emit("resend-offer", {
    //                 to: from
    //             })
    //         })
    //     }

    // })
    socket.on("request-offer", ({ from }) => {

        for (let roomId in activeCalls) {

            const call = activeCalls[roomId]

            if (call.users.includes(from)) {

                call.users.forEach(user => {

                    if (user !== from) {

                        const sockets = onlineUsers[user]

                        if (sockets) {
                            sockets.forEach(id => {
                                io.to(id).emit("resend-offer", {
                                    to: from
                                })
                            })
                        }

                    }

                })
            }
        }
    })
    //Resend offer
    socket.on("resend-offer", ({ to, offer, from, type }) => {

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
    socket.on("video-call-start", async ({ to, from, type }) => {

        console.log("📹 video-call-start:", from, "→", to)

        const roomId = [from, to].sort().join("-")

        activeCalls[roomId] = {
            users: [from]
        }

        const subs = await Subscription.find({ email: to })
        const senderName = await getDisplayName(to, from)

        subs.forEach(s => {
            webpush.sendNotification(
                s.sub,
                JSON.stringify({
                    title: "Incoming Call",
                    body: `📹 Video call from ${senderName}`,
                    url: "/videocall.html",
                    type: "video",
                    from: from,
                    isGroup: false
                })
            ).catch(err => {
                console.log("❌ Push error:", err.message)
            })
        })
    })
    // GROUP CALL START
    socket.on("group-call", async ({ groupId, from, type }) => {

        const group = await Group.findById(groupId)

        if (!group) return
        if (activeCalls[groupId]) {
            console.log("⚠️ Call already exists")
            return
        }
        activeCalls[groupId] = {
            type,
            users: [from]
        }

        group.members.forEach(async member => {

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
            const userSubs = await Subscription.find({ email: member })
            const groupName = group.name

            console.log("📲 Sending notification to:", member, "devices:", userSubs.length)
            const senderName = await getDisplayName(member, from)

            userSubs.forEach(s => {
                webpush.sendNotification(
                    s.sub,
                    JSON.stringify({
                        title: groupName,
                        body: `${type === "video" ? "📹 Video" : "📞 Voice"} call from ${senderName}`,
                        url: type === "video"
                            ? "/groupvideocall.html"
                            : "/groupvoicecall.html",
                        from: groupId,
                        type: type,
                        isGroup: true
                    })
                ).catch(err => {
                    console.log("❌ Push failed:", err.message)
                })
            })

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
    socket.on("join-chat", ({ user, chatId, isGroup }) => {

        if (!activeChats[user]) {
            activeChats[user] = {}
        }

        activeChats[user] = {
            chatId,
            isGroup
        }

        console.log("📍 Active chat:", user, chatId)
    })
    socket.on("notify-existing-users", ({ to, from }) => {

        const sockets = onlineUsers[to]

        if (sockets) {
            sockets.forEach(id => {
                io.to(id).emit("existing-user", {
                    user: from
                })
            })
        }

    })
    socket.on("join-group-call", ({ groupId, user }) => {

        socket.join(groupId)
        console.log("📥 JOIN GROUP CALL:", groupId, user)
        // 🔥 CREATE CALL IF NOT EXISTS (SAFE FIX)
        // if (!activeCalls[groupId]) {
        //     activeCalls[groupId] = {
        //         users: []
        //     }
        // }

        // ✅ CHECK ACTIVE CALL
        const call = activeCalls[groupId]

        if (call) {

            // notify existing users
            call.users.forEach(existingUser => {

                const sockets = onlineUsers[existingUser]

                if (sockets) {
                    sockets.forEach(id => {
                        io.to(id).emit("user-joined-call", {
                            user
                        })
                    })
                }
            })

            // add new user
            if (!call.users.includes(user)) {
                call.users.push(user)
            }
        }


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
            missed: call.missed
        })

    }

    res.json(result)

})
httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at localhost ${PORT}`)
})
