import { ContactLink, LegalPage, LegalSection } from './LegalPage';

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms cover your use of Robbie, an app for running meetings and keeping an
        organization's governing documents. By using Robbie you agree to them.
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
          these terms may be suspended.
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
