function createModal(content, onSubmit) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
        background: white;
        padding: 30px;
        border-radius: 8px;
        min-width: 500px;
        max-width: 700px;
        width: 100%;
        font-size: 1.1em;
        font-family: 'Segoe UI', sans-serif;
    `;

    modal.innerHTML = content;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeModal = () => {
        document.body.removeChild(overlay);
    };

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeModal();
        }
    });

    document.addEventListener('keydown', function handleKey(e) {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleKey);
        }
        // Enter is handled by the submit button — don't auto-submit from the textarea
    });

    return { modal, closeModal };
}
