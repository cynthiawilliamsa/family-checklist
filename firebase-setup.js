// Import Firebase SDKs
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, updateDoc, deleteDoc, doc, query, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase (ensure no duplicate initialization)
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Global variables
let userId = 'anonymous'; // Default to anonymous
const appId = 'default-app-id'; // Replace with dynamic app ID if needed

// DOM element references
const elements = {
    newChoreInput: document.getElementById('newChoreInput'),
    assigneeSelect: document.getElementById('assigneeSelect'),
    addChoreBtn: document.getElementById('addChoreBtn'),
    choreList: document.getElementById('choreList'),
    clearCompletedBtn: document.getElementById('clearCompletedBtn'),
    userIdDisplay: document.getElementById('userIdDisplay'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    messageModal: document.getElementById('messageModal'),
    modalMessage: document.getElementById('modalMessage'),
    closeModalBtn: document.getElementById('closeModalBtn')
};

// Utility function to show a message in the modal
function showMessage(message) {
    elements.modalMessage.textContent = message;
    elements.messageModal.style.display = 'flex';
}

// Close modal functionality
elements.closeModalBtn.addEventListener('click', () => {
    elements.messageModal.style.display = 'none';
});
window.addEventListener('click', (event) => {
    if (event.target === elements.messageModal) {
        elements.messageModal.style.display = 'none';
    }
});

// Firebase authentication logic
function setupAuth() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            userId = user.uid;
            console.log("User authenticated with ID:", userId);
            elements.userIdDisplay.textContent = `User ID: ${userId}`;
            setupFirestoreListener();
        } else {
            userId = 'anonymous';
            elements.userIdDisplay.textContent = 'User ID: Not authenticated';
        }
    });

    const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
    if (initialAuthToken) {
        signInWithCustomToken(auth, initialAuthToken).catch((error) => {
            console.error("Error signing in with custom token:", error);
        });
    } else {
        signInAnonymously(auth).catch((error) => {
            console.error("Error signing in anonymously:", error);
        });
    }
}

// Firestore listener for chores
function setupFirestoreListener() {
    if (!db || userId === 'anonymous') {
        console.warn("Firestore not ready or user not authenticated.");
        return;
    }

    elements.loadingIndicator.classList.remove('hidden');

    const choresCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/chores`);
    console.log("Firestore path:", `artifacts/${appId}/users/${userId}/chores`);
    const q = query(choresCollectionRef);

    onSnapshot(q, (snapshot) => {
        elements.choreList.innerHTML = ''; // Clear current list
        const chores = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        chores.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)); // Sort by timestamp
        chores.forEach(renderChore);

        elements.loadingIndicator.classList.add('hidden');
    }, (error) => {
        console.error("Error fetching chores:", error);
        showMessage("Failed to load chores. Please refresh the page.");
        elements.loadingIndicator.classList.add('hidden');
    });
}

// Render a single chore item
function renderChore(chore) {
    const listItem = document.createElement('li');
    listItem.className = `flex items-center bg-gray-50 p-4 rounded-lg shadow-sm border border-gray-100 ${chore.completed ? 'completed-chore' : ''}`;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = chore.completed;
    checkbox.className = 'form-checkbox h-6 w-6 text-indigo-600 rounded-md focus:ring-indigo-500 transition duration-150 ease-in-out';
    checkbox.addEventListener('change', async () => {
        try {
            await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/chores`, chore.id), { completed: checkbox.checked });
        } catch (error) {
            console.error("Error updating chore status:", error);
            showMessage("Failed to update chore status.");
        }
    });

    const choreSpan = document.createElement('span');
    choreSpan.className = 'ml-4 text-gray-800 text-lg flex-grow';
    choreSpan.textContent = chore.assignedTo && chore.assignedTo !== 'Unassigned'
        ? `${chore.text} (Assigned to: ${chore.assignedTo})`
        : chore.text;

    const deleteButton = document.createElement('button');
    deleteButton.className = 'ml-4 text-red-500 hover:text-red-700 focus:outline-none transition duration-150 ease-in-out';
    deleteButton.innerHTML = `
        <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
        </svg>
    `;
    deleteButton.addEventListener('click', async () => {
        try {
            await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/chores`, chore.id));
        } catch (error) {
            console.error("Error deleting chore:", error);
            showMessage("Failed to delete chore.");
        }
    });

    listItem.append(checkbox, choreSpan, deleteButton);
    elements.choreList.appendChild(listItem);
}

// Add a new chore
elements.addChoreBtn.addEventListener('click', async () => {
    const choreText = elements.newChoreInput.value.trim();
    const assignedTo = elements.assigneeSelect.value;

    if (!choreText) {
        showMessage("Please enter a chore.");
        return;
    }

    try {
        await addDoc(collection(db, `artifacts/${appId}/users/${userId}/chores`), {
            text: choreText,
            completed: false,
            assignedTo,
            timestamp: Date.now()
        });
        elements.newChoreInput.value = '';
        elements.assigneeSelect.value = 'Unassigned';
        elements.newChoreInput.focus();
    } catch (error) {
        console.error("Error adding chore:", error);
        showMessage("Failed to add chore.");
    }
});

// Clear completed chores
elements.clearCompletedBtn.addEventListener('click', async () => {
    try {
        const choresCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/chores`);
        const snapshot = await getDocs(query(choresCollectionRef));

        const deletePromises = snapshot.docs
            .filter(docSnapshot => docSnapshot.data().completed)
            .map(docSnapshot => deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/chores`, docSnapshot.id)));

        await Promise.all(deletePromises);
        showMessage("Completed chores cleared!");
    } catch (error) {
        console.error("Error clearing completed chores:", error);
        showMessage("Failed to clear completed chores.");
    }
});

// Initialize Firebase when the window loads
window.onload = setupAuth;