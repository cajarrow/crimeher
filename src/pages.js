// Plain pages: About, Contact, Privacy, Terms. Short, readable, and honest about how the site works.
// hello@crimeher.com is an alias on the Namecheap Private Email mailbox (MX stays with Private Email).
export const CONTACT = 'hello@crimeher.com';
const UPDATED = 'November 6, 2026';
const mail = `<a href="mailto:${CONTACT}">${CONTACT}</a>`;

export const PAGES = {
  '/about': {
    title: 'About CrimeHer',
    desc: 'CrimeHer is your daily true-crime briefing: one page of the day’s true-crime headlines, each linking to the original reporting.',
    body: `<h1>About CrimeHer</h1>
<p class="lede">Your daily true-crime briefing: one page with the day’s true-crime headlines, from breaking news and missing persons to trials, cold cases and the shows everyone’s talking about.</p>
<h2>How it works</h2>
<p>We watch dozens of news outlets, police agencies and public-safety sources through the day. The stories worth your time get a clear headline and a link straight to the outlet that reported them. We never copy their stories; every click goes to the original reporting.</p>
<p>Headlines are written with the help of AI under our editorial rules, and anything that needs a human call waits for our editor before it goes up.</p>
<h2>Our rules</h2>
<ul>
<li>Accuracy first. A headline never says more than the reporting does.</li>
<li>Nobody is called guilty before a court says so.</li>
<li>Child victims are never named, except in an active missing-child alert or a well-known historic case.</li>
<li>Survivors of sexual assault are never named.</li>
<li>Mistakes get fixed fast. If you spot one, tell us.</li>
</ul>
<h2>Get in touch</h2>
<p>Tips, corrections or questions: ${mail}.</p>`
  },
  '/contact': {
    title: 'Contact CrimeHer',
    desc: 'Send CrimeHer a tip, a correction or a question.',
    body: `<h1>Contact</h1>
<p class="lede">Email ${mail}. We read everything.</p>
<ul>
<li><b>Tips:</b> send the link and a line on why it matters.</li>
<li><b>Corrections:</b> tell us which headline and what’s wrong. We fix errors quickly.</li>
<li><b>Removal requests and copyright:</b> include the page link and your contact details.</li>
<li><b>Advertising and partnerships:</b> tell us a little about what you have in mind.</li>
</ul>`
  },
  '/privacy': {
    title: 'Privacy Policy',
    desc: 'What CrimeHer collects, why, and the choices you have.',
    body: `<h1>Privacy Policy</h1>
<p class="lede">CrimeHer collects very little, and we don’t sell what we collect. Last updated ${UPDATED}.</p>
<h2>What we collect</h2>
<ul>
<li><b>Email address, if you sign up for the Daily Briefing.</b> We use it only to send the briefing and related updates from CrimeHer. Every email has an unsubscribe link, and you can ask us to delete your address at any time.</li>
<li><b>Which headlines get clicked.</b> When you click a headline, we count the click (which headline, and when) so we know what readers find useful. We don’t store your name, email or IP address with it.</li>
<li><b>Site analytics.</b> We use Google Analytics to understand overall traffic, such as how many people visit and which pages they view. Google Analytics uses cookies. You can opt out with <a href="https://tools.google.com/dlpage/gaoptout" rel="noopener" target="_blank">Google’s opt-out add-on</a> or your browser’s cookie settings.</li>
<li><b>Server logs.</b> Our hosting provider, Cloudflare, processes standard request information such as IP addresses to deliver the site and protect it from attacks.</li>
</ul>
<h2>Links to other sites</h2>
<p>Every headline links to another outlet. Their privacy practices are their own, so check their policies when you visit.</p>
<h2>Sharing</h2>
<p>We don’t sell or rent personal information. We share it only with service providers that help us run CrimeHer (hosting, analytics and email delivery), or when the law requires it.</p>
<h2>Children</h2>
<p>CrimeHer is for adults and isn’t directed to children under 13. We don’t knowingly collect their information.</p>
<h2>Your choices</h2>
<p>To unsubscribe, use the link in any email. To see or delete the information we hold about you, email ${mail}.</p>
<h2>Changes</h2>
<p>If we change this policy, we’ll update this page and the date above.</p>`
  },
  '/terms': {
    title: 'Terms of Use',
    desc: 'The terms for using CrimeHer.',
    body: `<h1>Terms of Use</h1>
<p class="lede">By using CrimeHer you agree to these terms. Last updated ${UPDATED}.</p>
<h2>What CrimeHer is</h2>
<p>CrimeHer is a headline service. We write short headlines about news reported by other outlets and link to their reporting. The linked stories belong to those outlets, and we aren’t responsible for their content.</p>
<h2>Accuracy</h2>
<p>We work to keep every headline accurate, and headlines are written with the help of AI under our editorial rules. News changes quickly and mistakes can happen, so check the original reporting for details. If you think a headline is wrong, email ${mail} and we’ll look at it promptly.</p>
<h2>Using the site</h2>
<ul>
<li>You may read, share and link to CrimeHer for personal, non-commercial use.</li>
<li>Don’t scrape, copy or republish the site in bulk, overload it, or try to get around its security.</li>
<li>Don’t use CrimeHer to harass anyone named in the news.</li>
</ul>
<h2>Copyright</h2>
<p>CrimeHer’s headlines, design and name are ours. If you believe something here infringes your rights, email ${mail} with the page link and the details, and we’ll respond.</p>
<h2>No warranty</h2>
<p>CrimeHer is provided “as is”, without warranties of any kind. To the fullest extent the law allows, we aren’t liable for any loss arising from your use of the site or of linked sites.</p>
<h2>Changes</h2>
<p>We may update these terms. The date above shows when they last changed, and continuing to use the site means you accept the current version.</p>`
  }
};
