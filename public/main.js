const socket = io(window.location.origin)

const loggedUserEmail = localStorage.getItem("loggedUser")

if (loggedUserEmail) {
    socket.emit("register-user", loggedUserEmail)
}
socket.on("receive-message", (msg) => {

    console.log("🔥 New message on main page:", msg)

    const currentUser = localStorage.getItem("loggedUser")

    let otherUser

    if (msg.isGroup) {
        otherUser = msg.groupId
    } else {
        otherUser = msg.from === currentUser ? msg.to : msg.from
    }

    // 🔥 Update existing contact OR reload list
    updateContactUI(otherUser, msg)
})
async function loadContacts() {

    // const res = await fetch(`/getcontacts/${loggedUserEmail}`)
    const res = await fetch(`/conversations/${loggedUserEmail}`)
    const contacts = await res.json()
    console.log("Contacts of the user are: ", contacts)
    const container = document.getElementById("contacts")
    container.innerHTML = ""
    console.log("Contacts: ", contacts)
    contacts.forEach(contact => {

        const div = document.createElement("div")
        div.className = "contact"
        div.setAttribute("data-email", contact.email)
        div.innerHTML = `
    ${contact.profileimage
                ? `<img src="${contact.profileimage}">`
                : contact.isGroup
                    ? `<div class="group-icon"><i class="fa-solid fa-users"></i></div>`
                    : `<img src="uploads/profilephotodefault.png">`
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
        // 🔥 LOAD SAVED UNREAD
        const key = "unread_" + contact.email
        const savedUnread = localStorage.getItem(key)

        if (savedUnread && parseInt(savedUnread) > 0) {
            let unreadDiv = div.querySelector(".unread")

            if (!unreadDiv) {
                unreadDiv = document.createElement("div")
                unreadDiv.className = "unread"
                div.querySelector(".contact-right").prepend(unreadDiv)
            }

            unreadDiv.innerText = savedUnread
        }
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
                })
            })
            loadContacts()
        })
        div.addEventListener("click", () => {
            const key = "unread_" + contact.email
            localStorage.removeItem(key)
            localStorage.setItem("chatWith", contact.email)
            localStorage.setItem("chatName", contact.name)
            localStorage.setItem("chatDp", contact.profileimage)
            localStorage.setItem("isGroup", contact.isGroup || false)
            window.location.href = "/chat.html"
        })
        container.appendChild(div)
    })
}
function updateContactUI(contactEmail, msg) {

    const contacts = document.querySelectorAll(".contact")

    let found = false

    contacts.forEach(div => {

        const storedEmail = div.getAttribute("data-email")

        if (storedEmail === contactEmail) {

            found = true

            // 🔥 update last message
            const timestamp = div.querySelector(".timestamp")
            if (timestamp) {
                timestamp.innerText = msg.message || "📎 File"
            }

            // 🔥 increase unread count
            // let unreadDiv = div.querySelector(".unread")

            // if (!unreadDiv) {
            //     unreadDiv = document.createElement("div")
            //     unreadDiv.className = "unread"
            //     div.querySelector(".contact-right").prepend(unreadDiv)
            //     unreadDiv.innerText = 1
            // } else {
            //     unreadDiv.innerText = parseInt(unreadDiv.innerText) + 1
            // }
            // 🔥 UNIQUE KEY
            const key = "unread_" + contactEmail

            let unreadCount = parseInt(localStorage.getItem(key)) || 0
            unreadCount++

            localStorage.setItem(key, unreadCount)

            // UI update
            let unreadDiv = div.querySelector(".unread")

            if (!unreadDiv) {
                unreadDiv = document.createElement("div")
                unreadDiv.className = "unread"
                div.querySelector(".contact-right").prepend(unreadDiv)
            }

            unreadDiv.innerText = unreadCount

            // 🔥 move to top
            const container = document.getElementById("contacts")
            container.prepend(div)
        }
    })

    // ❗ if not found → reload
    if (!found) {
        loadContacts()
    }
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
function logout() {
    localStorage.removeItem("loggedUser")
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
        })
    })

    loadContacts()   // reload list
}
loadContacts()
