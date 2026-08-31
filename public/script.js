document.querySelectorAll('[data-checkout]').forEach((button) => {
  button.addEventListener('click', (event) => {
    if (button.getAttribute('href') === '#') {
      event.preventDefault();
      alert('Checkout ainda não configurado. Adicione a URL real em public/index.html.');
    }
  });
});
