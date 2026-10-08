import { ContactLink, DmcaAgentDetails, LegalPage, LegalSection } from './LegalPage';
import { ABUSE_EMAIL, DMCA_AGENT, providerName } from './legalContact';

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms cover your use of Robbie, an app for running meetings and keeping an
        organization's governing documents, which {providerName()} provides. By using Robbie you
        agree to them.
      </p>
      <LegalSection heading="Who can use Robbie">
        <p>
          You must be 13 or older. If you use Robbie for an organization, you confirm that you may
          act for it.
        </p>
      </LegalSection>
      <LegalSection heading="A tool, not advice">
        <p>
          Robbie helps you follow Robert's Rules of Order and keep bylaws up to date. It does not
          give legal or parliamentary advice, and it can be wrong. Its quorum counts, vote results,
          minutes and document versions are aids: check them before you rely on them, and ask a
          lawyer or a parliamentarian when it matters.
        </p>
      </LegalSection>
      <LegalSection heading="Your organization's responsibility">
        <p>
          Each organization is responsible for following its own bylaws and the law that applies to
          it, including its rules on notice, quorum, voting and records. The chair and the
          organization, not Robbie, decide how a meeting is run and what was adopted.
        </p>
      </LegalSection>
      <LegalSection heading="Content">
        <p>
          Organizations own the documents, minutes, files and other content they put in Robbie, and
          decide who in the organization can see and change it. You let Robbie store that content
          and show it to the people your organization allows, and to anyone who has a public share
          link you create. Only upload content you have the right to share.
        </p>
      </LegalSection>
      <LegalSection heading="Acceptable use">
        <p>
          Don't use Robbie to break the law, to harass anyone, to get into organizations you don't
          belong to, or to interfere with the service.
        </p>
      </LegalSection>
      <LegalSection heading="Prohibited content">
        <p>Don't put any of this in Robbie, or link to it:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            Child sexual abuse material. Robbie reports it to the National Center for Missing &amp;
            Exploited Children, as the law requires, and closes the account.
          </li>
          <li>Content that infringes a copyright, trademark, privacy or other right.</li>
          <li>Malware, or anything else meant to harm a device or a system.</li>
          <li>Anything else that is illegal.</li>
        </ul>
        <p>
          Robbie may remove content that breaks these terms, and suspend or close the accounts that
          break them.
        </p>
      </LegalSection>
      <LegalSection heading="Copyright">
        <p>
          If you believe something in Robbie infringes your copyright, send a notice under the
          Digital Millennium Copyright Act to Robbie's designated agent. The notice must include:
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            your physical or electronic signature, as the copyright owner or someone authorized to
            act for them;
          </li>
          <li>the copyrighted work you say is infringed;</li>
          <li>
            the material you say infringes it, and where it is in Robbie (the organization, the
            meeting and the file's name), so it can be found;
          </li>
          <li>your name, postal address, phone number and email address;</li>
          <li>
            a statement that you believe in good faith that the use is not authorized by the
            copyright owner, its agent or the law;
          </li>
          <li>
            a statement that the information in the notice is accurate and, under penalty of
            perjury, that you are the owner or authorized to act for the owner.
          </li>
        </ul>
        <p>Robbie's designated agent:</p>
        <DmcaAgentDetails agent={DMCA_AGENT} />
        <p>
          When Robbie removes material after a notice, it tells the person who uploaded it. If they
          believe it was removed by mistake or misidentification, they can send the agent a
          counter-notice as the Act describes, and Robbie restores the material 10 to 14 business
          days later unless the person who sent the notice says they have gone to court.
        </p>
        <p>
          Robbie closes, in appropriate circumstances, the accounts of people who infringe copyright
          repeatedly.
        </p>
      </LegalSection>
      <LegalSection heading="Reporting a problem">
        <p>
          To report content in Robbie that you believe is illegal or abusive, write to{' '}
          <ContactLink email={ABUSE_EMAIL} />. Say where it is (the organization, the meeting and
          the file's name) and what is wrong with it, but don't attach or forward the content
          itself. Copyright notices go to the designated agent, above.
        </p>
      </LegalSection>
      <LegalSection heading="Limitation of liability">
        <p>
          Robbie is provided as is, without warranties of any kind. To the extent the law allows,
          its makers are not liable for indirect, incidental or consequential damages, for lost
          data, or for decisions made in or about meetings, and their total liability for any claim
          is limited to what you paid to use Robbie in the twelve months before the claim.
        </p>
      </LegalSection>
      <LegalSection heading="Changes and ending">
        <p>
          Robbie and these terms may change. When the terms change, Robbie asks you to accept them
          again before you go on. You can stop using Robbie at any time, and an account that breaks
          these terms may be suspended or closed.
        </p>
      </LegalSection>
      <LegalSection heading="Contact">
        <p>
          Questions about these terms: <ContactLink />.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
