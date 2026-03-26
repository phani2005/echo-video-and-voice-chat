let loggedUserEmail = ""
const socket = io(window.location.origin)
async function getUser() {

    const res = await fetch("/me", {
        credentials: "include"
    })

    const data = await res.json()

    loggedUserEmail = data.email

    socket.emit("register-user", loggedUserEmail)

    loadContacts()
}


getUser()

// if (loggedUserEmail) {
//     socket.emit("register-user", loggedUserEmail)
// }
socket.on("receive-message", (msg) => {

    console.log("🔥 New message:", msg)

    // 🔥 MOVE CONTACT TO TOP (WITHOUT FULL RELOAD)
    updateContactOnMessage(msg)

})
socket.on("messages-seen", () => {
    loadContacts()
})
async function loadContacts() {

    const res = await fetch(`/conversations/${loggedUserEmail}`,{
        credentials:"include"
    })
    const contacts = await res.json()

    const container = document.getElementById("contacts")
    container.innerHTML = ""

    // 🔥 SORT CONTACTS BY LATEST MESSAGE
    contacts
        .sort((a, b) => {
            const t1 = a.lastMessageTime ? new Date(a.lastMessageTime) : 0
            const t2 = b.lastMessageTime ? new Date(b.lastMessageTime) : 0
            return t2 - t1
        })
        .forEach(contact => {

            const div = document.createElement("div")
            div.className = "contact"
            div.dataset.email = contact.email   // 🔥 IMPORTANT (for realtime update)

            div.innerHTML = `
                ${contact.profileimage
                    ? `<img src="${contact.profileimage}">`
                    : contact.isGroup
                        ? `<div class="group-icon"><i class="fa-solid fa-users"></i></div>`
                        : `<img src="/profilephotodefault.png">`
                }

                <div class="contact-info">
                    <strong>${contact.name}</strong>
                    <div class="timestamp">${contact.lastMessage || ""}</div>
                </div>

                <div class="contact-right">
                    ${contact.unread > 0 ? `<div class="unread">${contact.unread}</div>` : ""}
                    <button class="delete-btn">✕</button>
                </div>
            `

            // ✅ DELETE BUTTON (UNCHANGED)
            const deleteBtn = div.querySelector(".delete-btn")
            deleteBtn.addEventListener("click", async (e) => {
                e.stopPropagation()
                const confirmDelete = confirm("Delete this contact?")
                if (!confirmDelete) return

                await fetch("/deletecontact", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        ownerEmail: loggedUserEmail,
                        contactEmail: contact.email
                    }),
                    credentials:"include"
                })

                loadContacts()
            })

            // ✅ OPEN CHAT (UNCHANGED)
            div.addEventListener("click", () => {
                localStorage.setItem("chatWith", contact.email)
                localStorage.setItem("chatName", contact.name)
                localStorage.setItem("chatDp", contact.profileimage)
                localStorage.setItem("isGroup", contact.isGroup || false)
                window.location.href = "/chat.html"
            })

            container.appendChild(div)
        })
}
function updateContactOnMessage(msg) {

    const container = document.getElementById("contacts")

    let contactId = msg.isGroup
        ? msg.groupId
        : (msg.from === loggedUserEmail ? msg.to : msg.from)

    const existing = [...container.children].find(div =>
        div.dataset.email === contactId
    )

    // 🔥 FIX STARTS HERE
    let dpHtml = `<img src="/profilephotodefault.png">`

    if (existing) {
        const oldImg = existing.querySelector("img")

        if (oldImg) {
            dpHtml = `<img src="${oldImg.src}">`
        }

        existing.remove()
    }
    // 🔥 FIX ENDS HERE

    const name = existing
        ? existing.querySelector("strong").innerText
        : contactId

    const unreadCount = existing
        ? parseInt(existing.querySelector(".unread")?.innerText || 0)
        : 0

    let newUnread = unreadCount

    if (msg.from !== loggedUserEmail) {
        newUnread += 1
    }

    const div = document.createElement("div")
    div.className = "contact"
    div.dataset.email = contactId

    div.innerHTML = `
        ${dpHtml}
        <div class="contact-info">
            <strong>${name}</strong>
            <div class="timestamp">${msg.message}</div>
        </div>
        <div class="contact-right">
            ${newUnread > 0 ? `<div class="unread">${newUnread}</div>` : ""}
        </div>
    `

    div.addEventListener("click", () => {

        localStorage.setItem("chatWith", contactId)
        localStorage.setItem("chatName", name)

        // 🔥 IMPORTANT FIX
        if (msg.isGroup) {
            localStorage.setItem("isGroup", "true")
        } else {
            localStorage.setItem("isGroup", "false")
        }

        window.location.href = "/chat.html"
    })

    container.prepend(div)
}
function filterContacts() {
    const value = document.getElementById("search").value.toLowerCase()
    const contacts = document.querySelectorAll(".contact")

    contacts.forEach(contact => {
        contact.style.display = contact.innerText.toLowerCase().includes(value)
            ? "flex" : "none"
    })
}

function openAddContact() {
    window.location.href = "/newcontact.html"
}

function openChangeDp() {
    window.location.href = "/changedp.html"
}
function openCreateGroup() {
    window.location.href = "/addgroup.html"
}
async function logout() {

    // 🔥 GET SERVICE WORKER
    const registration = await navigator.serviceWorker.ready

    const subscription = await registration.pushManager.getSubscription()

    if (subscription) {

        // 🔥 REMOVE FROM DB
        await fetch("/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                endpoint: subscription.endpoint
            })
        })

        // 🔥 REMOVE FROM BROWSER
        await subscription.unsubscribe()
    }

    // 🔥 LOGOUT USER
    await fetch("/logout", {
        method: "POST",
        credentials: "include"
    })

    localStorage.clear()

    window.location.href = "/login.html"
}
function openProfile() {
    window.location.href = "/profile.html"
}

function openChangeMyName() {
    window.location.href = "/changemyname.html"
}
function openCalls() {
    window.location.href = "/callinfo.html"
}
async function deleteContact(contactEmail) {

    const confirmDelete = confirm("Delete this contact?")

    if (!confirmDelete) return

    await fetch("/deletecontact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            ownerEmail: localStorage.getItem("loggedUser"),
            contactEmail: contactEmail
        }),
        credentials:"include"
    })

    loadContacts()   // reload list
}
loadContacts()
