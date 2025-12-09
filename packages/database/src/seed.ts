import { prisma } from "./index.js";

/**
 * Utility Company Customer Service Database Seed
 * 
 * Seeds the database with utility-specific test data:
 * - Customers with service accounts
 * - Service records (billing, usage)
 * - Knowledge base articles for utility topics
 */

async function main() {
  console.log("🌱 Seeding database with utility company data...");

  // Clear existing data
  await prisma.switchLog.deleteMany();
  await prisma.call.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.knowledgeArticle.deleteMany();

  // ===========================================
  // Create test customers with utility accounts
  // ===========================================
  const customers = await Promise.all([
    prisma.customer.create({
      data: {
        name: "Maria Rodriguez",
        email: "maria.rodriguez@email.com",
        phone: "+1234567890",
      },
    }),
    prisma.customer.create({
      data: {
        name: "James Chen",
        email: "james.chen@email.com",
        phone: "+1987654321",
      },
    }),
    prisma.customer.create({
      data: {
        name: "Sarah Williams",
        email: "sarah.williams@email.com",
        phone: "+1555123456",
      },
    }),
    prisma.customer.create({
      data: {
        name: "Robert Johnson",
        email: "robert.johnson@email.com",
        phone: "+1555987654",
      },
    }),
  ]);

  console.log(`✅ Created ${customers.length} utility customers`);

  // ===========================================
  // Create service records (using Order model for billing/usage)
  // In production, you'd have a dedicated ServiceAccount model
  // ===========================================
  const serviceRecords = await Promise.all([
    // Maria - Residential Electric + Gas
    prisma.order.create({
      data: {
        customerId: customers[0].id,
        status: "DELIVERED", // Active service
        total: 187.45, // Current bill amount
        items: [
          { 
            service: "Electric", 
            accountNumber: "EL-2024-001234",
            address: "123 Oak Street, Apt 4B",
            meterNumber: "MTR-E-78901",
            usage: "842 kWh",
            rate: "Residential Time-of-Use"
          },
          { 
            service: "Natural Gas", 
            accountNumber: "GS-2024-001234",
            address: "123 Oak Street, Apt 4B",
            meterNumber: "MTR-G-45678",
            usage: "45 therms",
            rate: "Residential Standard"
          },
        ],
      },
    }),
    // James - Commercial Electric
    prisma.order.create({
      data: {
        customerId: customers[1].id,
        status: "DELIVERED",
        total: 1245.80,
        items: [
          { 
            service: "Electric", 
            accountNumber: "EL-2024-005678",
            address: "456 Business Park Dr, Suite 200",
            meterNumber: "MTR-E-23456",
            usage: "4,521 kWh",
            rate: "Small Commercial"
          },
        ],
      },
    }),
    // Sarah - Residential (past due)
    prisma.order.create({
      data: {
        customerId: customers[2].id,
        status: "PROCESSING", // Payment pending
        total: 342.67,
        items: [
          { 
            service: "Electric", 
            accountNumber: "EL-2024-009012",
            address: "789 Maple Lane",
            meterNumber: "MTR-E-34567",
            usage: "1,245 kWh",
            rate: "Residential Standard",
            pastDue: true,
            pastDueAmount: 156.22,
            dueDate: "2024-01-15"
          },
        ],
      },
    }),
    // Robert - New service pending
    prisma.order.create({
      data: {
        customerId: customers[3].id,
        status: "PENDING", // Service pending activation
        total: 75.00, // Connection fee
        items: [
          { 
            service: "Electric", 
            accountNumber: "EL-2024-012345",
            address: "321 Pine Avenue",
            requestType: "New Service",
            scheduledDate: "2024-02-01",
            connectionFee: 75.00
          },
        ],
      },
    }),
  ]);

  console.log(`✅ Created ${serviceRecords.length} service records`);

  // ===========================================
  // Create utility-specific knowledge base articles
  // ===========================================
  const articles = await Promise.all([
    // Billing & Payments
    prisma.knowledgeArticle.create({
      data: {
        title: "Understanding Your Utility Bill",
        content: `Your utility bill includes several components:

**Basic Service Charge**: A fixed monthly fee ($12.50 for residential, $25.00 for commercial) that covers meter reading, billing, and customer service.

**Energy Charges**: Based on your actual usage measured in kilowatt-hours (kWh) for electricity or therms for natural gas. Rates vary by time of use and season.

**Delivery Charges**: Covers the cost of maintaining power lines, pipes, and distribution infrastructure.

**Taxes & Fees**: State and local taxes, plus regulatory fees.

**How to Read Your Meter**: Your meter displays cumulative usage. We subtract last month's reading from this month's to calculate usage.

For billing questions, customers can view detailed usage history in their online account or call customer service.`,
        category: "BILLING",
      },
    }),
    
    prisma.knowledgeArticle.create({
      data: {
        title: "Payment Options and Due Dates",
        content: `We offer multiple convenient payment options:

**Online Payment**: Pay through our website or mobile app using credit/debit card or bank transfer. Available 24/7.

**Auto-Pay**: Set up automatic payments from your bank account. Enrollment earns a $2 monthly discount.

**Phone Payment**: Call 1-800-PAY-UTIL to pay by phone. A $2.50 convenience fee applies.

**Mail**: Send check or money order to our payment processing center. Allow 5-7 days for processing.

**In Person**: Pay at authorized payment locations including most grocery stores and pharmacies.

**Due Dates**: Bills are due 21 days after the statement date. Late payments incur a 1.5% penalty.

**Budget Billing**: Spread your annual costs evenly across 12 months to avoid seasonal spikes.`,
        category: "PAYMENTS",
      },
    }),
    
    prisma.knowledgeArticle.create({
      data: {
        title: "Payment Assistance Programs",
        content: `We understand financial hardships happen. We offer several assistance options:

**Payment Arrangements**: Spread past-due balances over 3-12 months while keeping current on new charges.

**LIHEAP (Low Income Home Energy Assistance Program)**: Federal program providing bill assistance to qualifying households. Apply through your local Community Action Agency.

**Medical Baseline Program**: Provides additional energy at the lowest rate for customers with qualifying medical conditions requiring electrically-powered equipment.

**Senior Discount**: Customers 65+ may qualify for a 15% discount on the basic service charge.

**Hardship Program**: One-time debt forgiveness up to $300 for customers facing temporary financial crisis.

**Winter Protection Plan**: From November 1 through March 31, we do not disconnect residential service for non-payment. Payment plans are required.

To apply for assistance, call our dedicated helpline at 1-800-555-HELP or visit a local office.`,
        category: "ASSISTANCE",
      },
    }),

    // Outages & Emergencies
    prisma.knowledgeArticle.create({
      data: {
        title: "Power Outage Information",
        content: `**Reporting an Outage**: 
- Call our 24/7 outage line: 1-800-OUT-LINE
- Report online at outage.utilitycompany.com
- Text "OUT" to 78901

**Before Reporting**: Check your circuit breaker or fuse box. If only your home is affected, the issue may be internal.

**Estimated Restoration Times**: We provide estimates based on crew assessments. Major storms may extend restoration times.

**Outage Map**: View real-time outage information on our website showing affected areas and estimated restoration.

**Safety During Outages**:
- Never use generators indoors
- Avoid downed power lines (stay 35 feet away)
- Keep refrigerator/freezer closed to preserve food
- Use flashlights, not candles
- Unplug sensitive electronics to prevent surge damage

**Medical Equipment**: If you rely on electric medical equipment, register with our Life Support program for priority restoration.

**Planned Outages**: Scheduled maintenance outages are communicated 48-72 hours in advance.`,
        category: "OUTAGES",
      },
    }),
    
    prisma.knowledgeArticle.create({
      data: {
        title: "Gas Leak Emergency Procedures",
        content: `**EMERGENCY: If you smell gas, act immediately!**

**Signs of a Gas Leak**:
- Rotten egg or sulfur smell (gas is odorized for safety)
- Hissing or blowing sound near gas lines
- Dead vegetation in an otherwise green area
- Dirt or dust blowing from a hole in the ground
- Bubbles in standing water

**What to Do**:
1. DO NOT turn on/off any electrical switches or appliances
2. DO NOT use phones inside the building
3. DO NOT light matches or create any spark
4. Leave the building immediately
5. Call 911 and our emergency line from outside: 1-800-GAS-LEAK
6. Keep others away from the area

**What NOT to Do**:
- Don't try to locate the leak yourself
- Don't try to repair gas lines
- Don't re-enter until cleared by emergency personnel

**Carbon Monoxide Warning**: Gas appliances can produce CO. Install detectors on every floor and near sleeping areas.

Our emergency crews are available 24/7/365.`,
        category: "EMERGENCY",
      },
    }),

    // Service Changes
    prisma.knowledgeArticle.create({
      data: {
        title: "Starting New Service",
        content: `**To Start Service, You'll Need**:
- Government-issued ID
- Social Security Number (for credit check) or $200 deposit
- Service address and move-in date
- Previous utility account info (if available)

**How to Apply**:
- Online: Start service in minutes at our website
- Phone: Call 1-800-NEW-SRVC (M-F 7AM-7PM, Sat 8AM-5PM)
- In Person: Visit a customer service center

**Timeline**:
- Most services activated within 1-2 business days
- New construction may require meter installation (5-10 business days)

**Connection Fees**:
- Standard connection: $35
- Same-day/priority connection: $75
- New meter installation: $150-300 (varies by type)

**Deposit Requirements**:
- First-time customers without utility credit history: $200
- Customers with poor payment history: 2x average monthly bill
- Deposits refunded after 12 months of on-time payments

**Landlord/Tenant**: We can work with property managers for seamless tenant transitions.`,
        category: "NEW_SERVICE",
      },
    }),
    
    prisma.knowledgeArticle.create({
      data: {
        title: "Transferring or Stopping Service",
        content: `**To Transfer Service (Moving)**:
- Provide 3-5 business days notice
- We can schedule stop and start for the same day
- Final bill sent within 7 days
- Security deposits transfer to new account or are applied to final bill

**Required Information**:
- Current account number
- Move-out date and forwarding address
- Move-in address (if transferring)

**Final Bill**:
- Based on actual meter read or estimate
- Includes all charges through service end date
- Any deposit credits applied automatically
- Refunds mailed within 30 days

**To Stop Service**:
- Online: Manage account → Stop Service
- Phone: 1-800-END-SRVC
- Allow 3 business days for processing

**Tips for Moving**:
- Take photos of final meter readings
- Notify us of any access issues for final read
- Consider budget billing at new location
- Update payment methods for new account`,
        category: "TRANSFER_SERVICE",
      },
    }),

    // Meters & Usage
    prisma.knowledgeArticle.create({
      data: {
        title: "Smart Meter Information",
        content: `**About Smart Meters**:
Smart meters provide two-way communication between your home and our systems, enabling:
- Automatic meter readings (no more estimated bills)
- Real-time usage monitoring
- Faster outage detection and restoration
- Time-of-use rate options

**Accessing Your Data**:
- Log in to your online account
- View hourly, daily, and monthly usage
- Compare to previous periods
- Set usage alerts

**Common Questions**:

*Are smart meters safe?*
Yes. Smart meters emit low-level radio frequency (RF) signals, far below FCC limits—less than a cell phone.

*Will my bill increase?*
No. Smart meters measure the same as traditional meters. Some customers see changes because estimates are replaced with actual readings.

*Can I opt out?*
Yes, but a $75 opt-out fee and $25/month manual reading fee apply.

**High Usage Alerts**: Set alerts to notify you when usage exceeds a threshold to avoid bill surprises.`,
        category: "METERS",
      },
    }),
    
    prisma.knowledgeArticle.create({
      data: {
        title: "High Bill Investigation",
        content: `**Why Might Your Bill Be Higher?**

**Seasonal Factors**:
- Summer: Air conditioning can double or triple electric usage
- Winter: Heating is typically the largest energy expense
- Compare to same month last year, not last month

**Rate Changes**:
- Check statement for rate adjustment notices
- Summer rates are typically higher than winter

**Usage Changes**:
- New appliances (especially AC, space heaters, pool pumps)
- More people at home
- Guests staying
- Home business equipment

**Equipment Issues**:
- HVAC running constantly (check filter, refrigerant)
- Water heater malfunction (check for leaks)
- Old refrigerator/freezer (consider ENERGY STAR replacement)

**What We Can Do**:
1. Verify meter reading accuracy (free meter test)
2. Provide usage comparison analysis
3. Check for billing errors
4. Review rate options for your usage pattern
5. Schedule free home energy audit

**Energy Efficiency Programs**:
- Free home energy audit
- Rebates on ENERGY STAR appliances
- LED bulb giveaways
- Insulation and weatherization programs`,
        category: "HIGH_BILL",
      },
    }),

    // Energy Efficiency
    prisma.knowledgeArticle.create({
      data: {
        title: "Energy Efficiency Programs & Rebates",
        content: `**Available Rebates**:

**HVAC**:
- Central AC (16+ SEER): $300 rebate
- Heat pump: $500-800 rebate
- Smart thermostat: $50 rebate
- Duct sealing: $150 rebate

**Appliances**:
- ENERGY STAR refrigerator: $75 rebate
- ENERGY STAR washer: $50 rebate
- Electric water heater (heat pump): $400 rebate

**Lighting**:
- Free LED bulb kits (up to 20 bulbs per household)

**Home Improvements**:
- Attic insulation: Up to $300
- Window replacement: $50 per window (max $500)
- Whole home energy audit: Free ($200 value)

**How to Claim**:
1. Purchase qualifying equipment
2. Submit rebate form within 90 days
3. Include proof of purchase and equipment specs
4. Rebate check mailed within 6-8 weeks

**Income-Qualified Programs**:
Low-income customers may qualify for free weatherization including insulation, air sealing, and appliance replacement through our partnership with Community Action Agencies.`,
        category: "EFFICIENCY",
      },
    }),

    // Service Disconnection
    prisma.knowledgeArticle.create({
      data: {
        title: "Disconnection and Reconnection",
        content: `**Before We Disconnect**:
We never disconnect without notice. You'll receive:
- Past-due notice (14 days)
- Disconnection warning (7 days)
- Door hanger/final notice (48 hours)

**We Cannot Disconnect**:
- Medical baseline customers (with valid certification)
- During extreme weather (below 32°F or above 95°F)
- On weekends or holidays
- Without proper notice

**How to Avoid Disconnection**:
1. Pay past-due amount in full
2. Enter payment arrangement before disconnection date
3. Apply for assistance programs
4. Contact us—we want to help find a solution

**Reconnection**:
- Pay past-due balance OR enter payment plan
- Pay reconnection fee: $50 (same day: $100)
- Service restored within 24 hours (same day if paid by 3 PM)

**After Hours Emergency**: If disconnected and medical emergency arises, call our 24/7 line. Proof of emergency may allow temporary restoration.

**Deposit After Disconnection**: A security deposit (2x average bill) may be required.`,
        category: "DISCONNECTION",
      },
    }),

    // Contact & Hours
    prisma.knowledgeArticle.create({
      data: {
        title: "Contact Information & Service Hours",
        content: `**Customer Service**:
- Phone: 1-800-555-UTIL (8548)
- Hours: Monday-Friday 7 AM - 7 PM, Saturday 8 AM - 5 PM

**24/7 Emergency Lines**:
- Power Outage: 1-800-OUT-LINE
- Gas Emergency: 1-800-GAS-LEAK
- Downed Power Line: Call 911, then 1-800-555-DOWN

**Online Services** (available 24/7):
- Pay bills
- View usage and history
- Report outages
- Start/stop/transfer service
- Update contact information
- Enroll in programs

**Customer Service Centers**:
- Main Office: 100 Utility Plaza, Downtown (M-F 8-5)
- North Center: 500 Commerce Dr (M-F 9-6, Sat 9-1)
- South Center: 250 Main Street (M-F 9-6, Sat 9-1)

**Mobile App**: Download "MyUtility" from App Store or Google Play for account management on the go.

**Social Media**: Follow us @UtilityCo for outage updates and energy tips.`,
        category: "CONTACT",
      },
    }),
  ]);

  console.log(`✅ Created ${articles.length} utility knowledge base articles`);

  console.log("");
  console.log("✅ Utility company seed complete!");
  console.log("");
  console.log("📊 Summary:");
  console.log(`   - ${customers.length} customers with service accounts`);
  console.log(`   - ${serviceRecords.length} service records`);
  console.log(`   - ${articles.length} knowledge base articles`);
  console.log("");
  console.log("🔑 Categories seeded:");
  const categories = [...new Set(articles.map((a) => a.category))];
  categories.forEach((c) => console.log(`   - ${c}`));
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
