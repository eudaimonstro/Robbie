import { ContactLink, LegalPage, LegalSection } from './LegalPage';
import { providerName } from './legalContact';

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This policy says what Robbie, provided by {providerName()}, keeps about you, why, and who
        can see it.
      </p>
      <LegalSection heading="What Robbie keeps">
        <ul className="list-disc pl-6 space-y-1">
          <li>Your email address and the name you give, to sign you in and show who you are.</li>
          <li>
            Your sign-in sessions: whether each is on the web or the phone app, and when it was last
            used.
          </li>
          <li>The organizations you belong to, and your role in each.</li>
          <li>
            What you do in meetings: when you are present, the motions you make, when you speak, and
            your votes.
          </li>
          <li>The minutes, documents, amendments and files your organizations keep in Robbie.</li>
          <li>When you accepted these documents, and which version.</li>
        </ul>
      </LegalSection>
      <LegalSection heading="Who can see it">
        <p>
          Members of an organization see its content as their role allows. The people in a meeting
          see your name, whether you are there, and what you do in it; whether a vote shows names
          depends on the kind of vote. Anyone with a document's public share link can read that
          document. Robbie doesn't sell your information or show ads.
        </p>
        <p>
          Robbie gives information to the authorities when the law requires it: it reports child
          sexual abuse material, with the account that uploaded it, to the National Center for
          Missing &amp; Exploited Children.
        </p>
      </LegalSection>
      <LegalSection heading="Your organization controls its content">
        <p>
          Each organization decides what goes into its records and who can see them. Minutes and
          votes are the organization's records and can keep your name after you leave it. To change
          an organization's records, ask its secretary or an admin.
        </p>
      </LegalSection>
      <LegalSection heading="Email">
        <p>
          Robbie sends sign-in codes, and notices that you were added to an organization, through
          Resend, an email delivery service, which receives your email address and the message.
        </p>
      </LegalSection>
      <LegalSection heading="Cookies">
        <p>
          Robbie uses one cookie, to keep you signed in. It uses no tracking or advertising cookies.
        </p>
      </LegalSection>
      <LegalSection heading="How long it is kept">
        <p>
          Sign-in codes expire after 15 minutes, and sessions 30 days after they were last used.
          Everything else is kept while your account or your organization exists. Content removed
          after a report, such as material that infringes copyright, malware or child sexual abuse
          material, is kept with the record of who uploaded it, when and where, for at least a year
          in a restricted folder only Robbie's operator can reach, and longer when the law or law
          enforcement requires it.
        </p>
      </LegalSection>
      <LegalSection heading="Deleting your account">
        <p>
          To delete your account, write to <ContactLink /> from the address you sign in with. Your
          account and sessions are deleted; an organization's records, such as minutes, may keep
          your name.
        </p>
      </LegalSection>
      <LegalSection heading="Children">
        <p>Robbie is not for children under 13.</p>
      </LegalSection>
      <LegalSection heading="Changes">
        <p>When this policy changes, Robbie asks you to accept it again before you go on.</p>
      </LegalSection>
    </LegalPage>
  );
}
