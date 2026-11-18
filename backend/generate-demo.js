const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CATEGORIES_FILE = path.join(__dirname, '..', 'database', 'categories.json');
const LOCATIONS_FILE = path.join(__dirname, '..', 'database', 'locations.json');
const MASTER_SEED_FILE = path.join(__dirname, '..', 'database', 'demo', 'marketplace-demo-seed.json');
const OUT_FILE = path.join(__dirname, '..', 'database', 'demo', 'businesses.json');

function generateMasterSeed() {
  const categoriesData = JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf8'));
  const demoBusinesses = [];
  let phoneCounter = 9800001000;
  let idCounter = 1;

  const sampleCities = [
    { state: 'Rajasthan', city: 'Kota', areas: ['Talwandi', 'Vigyan Nagar', 'Jawahar Nagar', 'Mahaveer Nagar III', 'Kunhari', 'Dadabari', 'Gumanpura', 'Borkheda'] },
    { state: 'Delhi', city: 'New Delhi', areas: ['Connaught Place', 'Karol Bagh', 'Lajpat Nagar', 'Saket', 'Dwarka', 'Rohini', 'Pitampura'] },
    { state: 'Maharashtra', city: 'Mumbai', areas: ['Andheri', 'Bandra', 'Dadar', 'Juhu', 'Powai', 'Worli', 'Malad'] },
    { state: 'Karnataka', city: 'Bengaluru', areas: ['Koramangala', 'Indiranagar', 'Jayanagar', 'HSR Layout', 'Whitefield', 'Electronic City'] },
    { state: 'Uttar Pradesh', city: 'Lucknow', areas: ['Hazratganj', 'Gomti Nagar', 'Aliganj', 'Indira Nagar', 'Alambagh'] },
    { state: 'Rajasthan', city: 'Jaipur', areas: ['C-Scheme', 'Malviya Nagar', 'Vaishali Nagar', 'Mansarovar', 'Raja Park'] }
  ];

  const photoPlaceholders = [
    'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1582407947304-fd86f028f716?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=600&q=80'
  ];

  for (const cat of categoriesData.categories) {
    for (const sub of cat.subcategories) {
      // 12 demo listings per subcategory to ensure robust counts (>10 per category)
      for (let i = 1; i <= 12; i++) {
        const loc = sampleCities[(idCounter + i) % sampleCities.length];
        const area = loc.areas[(idCounter + i) % loc.areas.length];
        const phone = String(phoneCounter++);
        const photo = photoPlaceholders[(idCounter + i) % photoPlaceholders.length];

        let businessCategory = cat.name;
        if (sub === 'Land & Plots') businessCategory = 'Land & Plots';
        else if (sub === 'Houses & Villas' || sub === 'Flats & Apartments') businessCategory = 'Houses & Flats';
        else if (sub === 'Shops & Showrooms' || sub === 'Commercial Property' || sub === 'Warehouse & Godown') businessCategory = 'Commercial Property';
        else if (sub === 'PG & Hostel') businessCategory = 'PG & Hostel';
        else if (sub === 'Tiffin & Food') businessCategory = 'Tiffin & Food';
        else if (sub === 'Bakery & Cakes') businessCategory = 'Bakery & Cakes';
        else if (sub === 'Laundry') businessCategory = 'Laundry';
        else if (sub === 'Repairs') businessCategory = 'Repairs';
        else if (sub === 'Tutors') businessCategory = 'Tutors';
        else if (sub === 'Salon & Beauty') businessCategory = 'Salon & Beauty';
        else if (sub === 'Printing') businessCategory = 'Printing';
        else if (sub === 'Cleaning') businessCategory = 'Cleaning';
        else if (sub === 'Packers & Movers') businessCategory = 'Packers & Movers';
        else if (sub === 'Tailor & Boutique') businessCategory = 'Tailor & Boutique';
        else if (sub === 'Travel & Tourism') businessCategory = 'Travel & Tourism';
        else if (sub === 'Healthcare' || sub.includes('Clinics')) businessCategory = 'Healthcare';
        else if (cat.id === 'shopping-retail') businessCategory = 'Shopping & Retail';
        else if (cat.id === 'vehicles') businessCategory = 'Vehicles';
        else if (cat.id === 'jobs') businessCategory = 'Jobs';
        else if (cat.id === 'agriculture') businessCategory = 'Agriculture';

        const name = `[DEMO] ${sub} - Partner ${i} (${loc.city})`;
        const priceTag = `₹${199 + i * 75} onwards`;
        const description = `DEMO MARKETPLACE LISTING: Top-rated ${sub.toLowerCase()} provider located in ${area}, ${loc.city}. Verified business with professional service, open daily. Contact via phone or WhatsApp for instant bookings.`;

        demoBusinesses.push({
          id: crypto.randomUUID(),
          name: name,
          category: businessCategory,
          categoryId: cat.id,
          parentCategory: cat.name,
          subcategory: sub,
          ownerName: `Demo Partner ${idCounter}`,
          phone: phone,
          whatsapp: phone,
          price: priceTag,
          photo: photo,
          state: loc.state,
          city: loc.city,
          area: area,
          address: `Shop #${i * 12 + 5}, Commercial Hub, ${area}, ${loc.city}`,
          description: description,
          status: 'approved',
          isVerified: true,
          isFeatured: (i === 1),
          isDemo: true,
          rating: (4.1 + (i * 0.05) % 0.8).toFixed(1),
          reviewCount: String(15 * i + 8),
          hours: '08:00 AM - 10:00 PM',
          createdAt: new Date().toISOString()
        });
        idCounter++;
      }
    }
  }

  const masterSeed = {
    version: "2.0.0-demo-master",
    generatedAt: new Date().toISOString(),
    description: "ZAROORAT Central Consolidated Marketplace Demo Seed",
    categories: categoriesData.categories,
    businesses: demoBusinesses
  };

  fs.mkdirSync(path.dirname(MASTER_SEED_FILE), { recursive: true });
  fs.writeFileSync(MASTER_SEED_FILE, JSON.stringify(masterSeed, null, 2));
  fs.writeFileSync(OUT_FILE, JSON.stringify({ version: "2.0.0-demo", description: "ZAROORAT Demo Environment Database", businesses: demoBusinesses }, null, 2));

  console.log(`Successfully generated master demo seed file at ${MASTER_SEED_FILE} with ${demoBusinesses.length} rich listings across all category groups.`);
}

if (require.main === module) {
  generateMasterSeed();
}

module.exports = { generateMasterSeed };
