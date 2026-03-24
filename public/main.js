const loggedUserEmail = localStorage.getItem("loggedUser")
// const socket = io(window.location.origin)

// if (loggedUserEmail) {
//     socket.emit("register-user", loggedUserEmail)
// }
// socket.on("receive-message", (msg) => {
//     console.log("🔥 New message received in main:", msg)

//     // reload contacts automatically
//     loadContacts()
// })
// socket.on("messages-seen", () => {
//     loadContacts()
// })
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
            localStorage.setItem("chatWith", contact.email)
            localStorage.setItem("chatName", contact.name)
            localStorage.setItem("chatDp", contact.profileimage)
            localStorage.setItem("isGroup", contact.isGroup || false)
            window.location.href = "/chat.html"
        })
        container.appendChild(div)
    })
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
