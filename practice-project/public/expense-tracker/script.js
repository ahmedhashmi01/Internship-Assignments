


let expenses = [];

const form = document.getElementById('expense-form');
form.addEventListener('submit', function(e) {
    e.preventDefault();
    let expense = {
          name : document.getElementById('expense-name').value,
          amount: parseFloat(document.getElementById('expense-amount').value),
          category: document.getElementById('select-category').value
    };
    expenses.push(expense);
    form.reset();
});

const searchButton = document.getElementById('search-button');
searchButton.addEventListener('click', function() {
    const s_name = document.getElementById('search-name').value;
    const s_category = document.getElementById('search-category').value;
    const searchResults = expenses.filter(exp => exp.name.includes(s_name) && (s_category === 'all' || exp.category === s_category));
    let resultsContainer = document.getElementById('expenses');
    resultsContainer.innerHTML = '';
    searchResults.forEach(exp => {
        let listItem = document.createElement('li');
        listItem.textContent = `Name: ${exp.name}, Amount: ${exp.amount}, Category: ${exp.category}`;
        resultsContainer.appendChild(listItem);
    });
});