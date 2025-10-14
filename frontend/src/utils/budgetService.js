// src/utils/budgetService.js
export const BUDGET_CATEGORIES = [
  { id: 'housing', name: 'Housing', icon: '🏠', color: 'text-blue-500' },
  { id: 'transportation', name: 'Transportation', icon: '🚗', color: 'text-green-500' },
  { id: 'food', name: 'Food & Dining', icon: '🍽️', color: 'text-orange-500' },
  { id: 'entertainment', name: 'Entertainment', icon: '🎬', color: 'text-purple-500' },
  { id: 'shopping', name: 'Shopping', icon: '🛍️', color: 'text-pink-500' },
  { id: 'healthcare', name: 'Healthcare', icon: '🏥', color: 'text-red-500' },
  { id: 'education', name: 'Education', icon: '📚', color: 'text-indigo-500' },
  { id: 'personal', name: 'Personal Care', icon: '💅', color: 'text-yellow-500' },
  { id: 'savings', name: 'Savings & Investments', icon: '💰', color: 'text-emerald-500' },
  { id: 'other', name: 'Other', icon: '📦', color: 'text-gray-500' }
];

export const DEFAULT_SPENDING_CAPS = {
  housing: 1500,
  transportation: 400,
  food: 600,
  entertainment: 200,
  shopping: 300,
  healthcare: 200,
  education: 150,
  personal: 100,
  savings: 500,
  other: 100
};

// Auto-categorize transactions based on description
export const categorizeTransaction = (transaction) => {
  const description = transaction.description?.toLowerCase() || '';
  const amount = transaction.amount;
  
  const categoryRules = {
    housing: [/rent|mortgage|housing|apartment|lease|property|home|utility|electric|water|gas|internet|wifi/i],
    transportation: [/uber|lyft|taxi|gas|fuel|car|auto|vehicle|transport|parking|maintenance|repair/i],
    food: [/restaurant|cafe|coffee|food|grocery|supermarket|meal|dining|eat|pizza|burger|bar|pub/i],
    entertainment: [/netflix|spotify|hulu|disney|movie|cinema|theater|concert|game|gaming|entertainment|fun/i],
    shopping: [/amazon|walmart|target|mall|store|shop|purchase|buy|retail|clothing|fashion/i],
    healthcare: [/hospital|doctor|medical|health|pharmacy|drugstore|dental|clinic|insurance/i],
    education: [/school|university|college|course|book|education|learning|tuition|student/i],
    personal: [/haircut|salon|spa|gym|fitness|yoga|beauty|personal|care/i],
    savings: [/investment|savings|stock|bond|retirement|401k|ira|deposit|contribution/i]
  };

  for (const [category, patterns] of Object.entries(categoryRules)) {
    if (patterns.some(pattern => pattern.test(description))) {
      return category;
    }
  }

  return 'other';
};

// Calculate category spending
export const calculateCategorySpending = (transactions) => {
  const categorySpending = {};
  
  BUDGET_CATEGORIES.forEach(category => {
    categorySpending[category.id] = transactions
      .filter(tx => tx.category === category.id && tx.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0);
  });

  return categorySpending;
};

// Check budget alerts
export const checkBudgetAlerts = (categorySpending, spendingCaps, currency, rate) => {
  const alerts = [];

  Object.entries(categorySpending).forEach(([category, spent]) => {
    const cap = spendingCaps[category];
    if (!cap) return;

    const percentage = (spent / cap) * 100;
    
    if (percentage >= 100) {
      alerts.push({
        type: 'warning',
        category,
        title: `Budget Exceeded: ${BUDGET_CATEGORIES.find(c => c.id === category)?.name}`,
        message: `You've spent ${formatCurrency(spent, currency, rate)} of ${formatCurrency(cap, currency, rate)} budget`,
        severity: 'high'
      });
    } else if (percentage >= 80) {
      alerts.push({
        type: 'warning', 
        category,
        title: `Budget Alert: ${BUDGET_CATEGORIES.find(c => c.id === category)?.name}`,
        message: `You've used ${Math.round(percentage)}% of your ${formatCurrency(cap, currency, rate)} budget`,
        severity: 'medium'
      });
    }
  });

  return alerts;
};