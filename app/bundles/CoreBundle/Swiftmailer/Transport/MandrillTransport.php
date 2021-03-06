<?php
/**
 * @package     Mautic
 * @copyright   2014 Mautic Contributors. All rights reserved.
 * @author      Mautic
 * @link        http://mautic.org
 * @license     GNU/GPLv3 http://www.gnu.org/licenses/gpl-3.0.html
 */

namespace Mautic\CoreBundle\Swiftmailer\Transport;

use Mautic\CoreBundle\Factory\MauticFactory;
use Mautic\CoreBundle\Helper\MailHelper;
use Symfony\Component\HttpFoundation\Request;

/**
 * Class MandrillTransport
 */
class MandrillTransport extends AbstractTokenHttpTransport implements InterfaceCallbackTransport
{

    /**
     * {@inheritdoc}
     */
    protected function getPayload()
    {
        $metadata     = $this->getMetadata();
        $mauticTokens = $mandrillMergeVars = $mandrillMergePlaceholders = array();

        // Mandrill uses *|PLACEHOLDER|* for tokens so Mautic's need to be replaced
        if (!empty($metadata)) {
            $metadataSet  = reset($metadata);
            $tokens       = (!empty($metadataSet['tokens'])) ? $metadataSet['tokens'] : array();
            $mauticTokens = array_keys($tokens);

            $mandrillMergeVars = $mandrillMergePlaceholders = array();
            foreach ($mauticTokens as $token) {
                $mandrillMergeVars[$token]         = strtoupper(preg_replace("/[^a-z0-9]+/i", "", $token));
                $mandrillMergePlaceholders[$token] = '*|'.$mandrillMergeVars[$token].'|*';
            }
        }

        $message = $this->messageToArray($mauticTokens, $mandrillMergePlaceholders);

        $message['from_email'] = $message['from']['email'];
        $message['from_name']  = $message['from']['name'];
        unset($message['from']);

        if (!empty($metadata)) {
            // Mandrill will only send a single email to cc and bcc of the first set of tokens
            // so we have to manually set them as to addresses

            // Problem is that it's not easy to know what email is sent so will tack it at the top
            $insertCcEmailHeader = true;

            $message['html'] = '*|HTMLCCEMAILHEADER|*'.$message['html'];
            if (!empty($message['text'])) {
                $message['text'] = '*|TEXTCCEMAILHEADER|*'.$message['text'];
            }

            // Do not expose all the emails in the if using metadata
            $message['preserve_recipients'] = false;

            $bcc = $message['recipients']['bcc'];
            $cc  = $message['recipients']['cc'];

            // Unset the cc and bcc as they will need to be sent as To with each set of tokens
            unset($message['recipients']['bcc'], $message['recipients']['cc']);
        }

        // Generate the recipients
        $recipients = $rcptMergeVars = $rcptMetadata = array();

        $translator = $this->factory->getTranslator();

        foreach ($message['recipients'] as $type => $typeRecipients) {
            foreach ($typeRecipients as $rcpt) {
                $rcpt['type'] = $type;
                $recipients[] = $rcpt;

                if ($type == 'to' && isset($metadata[$rcpt['email']])) {
                    if (!empty($metadata[$rcpt['email']]['tokens'])) {
                        $mergeVars = array(
                            'rcpt' => $rcpt['email'],
                            'vars' => array()
                        );

                        // This must not be included for CC and BCCs
                        $trackingPixelToken = array();

                        foreach ($metadata[$rcpt['email']]['tokens'] as $token => $value) {
                            if ($token == '{tracking_pixel}') {
                                $trackingPixelToken = array(
                                    array(
                                        'name'    => $mandrillMergeVars[$token],
                                        'content' => $value
                                    )
                                );

                                continue;
                            }

                            $mergeVars['vars'][] = array(
                                'name'    => $mandrillMergeVars[$token],
                                'content' => $value
                            );
                        }

                        if (!empty($insertCcEmailHeader)) {
                            // Make a copy before inserted the blank tokens
                            $ccMergeVars       = $mergeVars;
                            $mergeVars['vars'] = array_merge(
                                $mergeVars['vars'],
                                $trackingPixelToken,
                                array(
                                    array(
                                        'name'    => 'HTMLCCEMAILHEADER',
                                        'content' => ''
                                    ),
                                    array(
                                        'name'    => 'TEXTCCEMAILHEADER',
                                        'content' => ''
                                    )
                                )
                            );
                        } else {
                            // Just merge the tracking pixel tokens
                            $mergeVars['vars'] = array_merge($mergeVars['vars'], $trackingPixelToken);
                        }

                        // Add the vars
                        $rcptMergeVars[] = $mergeVars;

                        // Special handling of CC and BCC with tokens
                        if (!empty($cc) || !empty($bcc)) {
                            $ccMergeVars['vars'] = array_merge(
                                $ccMergeVars['vars'],
                                array(
                                    array(
                                        'name'    => 'HTMLCCEMAILHEADER',
                                        'content' => $translator->trans('mautic.core.email.cc.copy',
                                            array(
                                                '%email%' => $rcpt['email']
                                            )
                                        ) . "<br /><br />"
                                    ),
                                    array(
                                        'name'    => 'TEXTCCEMAILHEADER',
                                        'content' => $translator->trans('mautic.core.email.cc.copy',
                                            array(
                                                '%email%' => $rcpt['email']
                                            )
                                        ) . "\n\n"
                                    ),
                                    array(
                                        'name'    => 'TRACKINGPIXEL',
                                        'content' => MailHelper::getBlankPixel()
                                    )
                                )
                            );

                            // Send same tokens to each CC
                            if (!empty($cc)) {
                                foreach ($cc as $ccRcpt) {
                                    $recipients[]        = $ccRcpt;
                                    $ccMergeVars['rcpt'] = $ccRcpt['email'];
                                    $rcptMergeVars[]     = $ccMergeVars;
                                }
                            }

                            // And same to BCC
                            if (!empty($bcc)) {
                                foreach ($bcc as $ccRcpt) {
                                    $recipients[]        = $ccRcpt;
                                    $ccMergeVars['rcpt'] = $ccRcpt['email'];
                                    $rcptMergeVars[]     = $ccMergeVars;
                                }
                            }
                        }

                        unset($ccMergeVars, $mergeVars, $metadata[$rcpt['email']]['tokens']);
                    }

                    if (!empty($metadata[$rcpt['email']])) {
                        $rcptMetadata[] = array(
                            'rcpt'   => $rcpt['email'],
                            'values' => $metadata[$rcpt['email']]
                        );
                        unset($metadata[$rcpt['email']]);
                    }
                }
            }
        }

        $message['to'] = $recipients;

        unset($message['recipients']);

        // Set the merge vars
        $message['merge_vars'] = $rcptMergeVars;

        // Set the rest of $metadata as recipient_metadata
        $message['recipient_metadata'] = $rcptMetadata;

        // Set the reply to
        if (!empty($message['replyTo'])) {
            $message['headers']['Reply-To'] = $message['replyTo']['email'];
        }
        unset($message['replyTo']);

        // Package it up
        $payload = json_encode(
            array(
                'key'     => $this->getPassword(),
                'message' => $message
            )
        );

        return $payload;
    }

    /**
     * {@inheritdoc}
     */
    protected function getHeaders()
    {

    }

    /**
     * {@inheritdoc}
     */
    protected function getApiEndpoint()
    {
        return 'https://mandrillapp.com/api/1.0/messages/send.json';
    }

    /**
     * Start this Transport mechanism.
     */
    public function start()
    {
        // Make an API call to the ping endpoint
        $this->post(array(
            'url'     => 'https://mandrillapp.com/api/1.0/users/ping.json',
            'payload' => json_encode(array('key' => $this->getPassword()))
        ));

        $this->started = true;
    }

    /**
     * {@inheritdoc}
     *
     * @param $response
     * @param $info
     *
     * @return array
     * @throws \Swift_TransportException
     */
    protected function handlePostResponse($response, $info)
    {
        $response = json_decode($response, true);

        $return = array();
        if (is_array($response)) {
            if (isset($response['status']) && $response['status'] == 'error') {
                throw new \Swift_TransportException($response['message']);
            }

            foreach ($response as $stat) {
                if (in_array($stat['status'], array('rejected', 'invalid'))) {
                    $return[] = $stat['email'];
                }
            }
        }

        return $return;
    }


    /**
     * Returns a "transport" string to match the URL path /mailer/{transport}/callback
     *
     * @return mixed
     */
    public function getCallbackPath()
    {
        return 'mandrill';
    }

    /**
     * @return int
     */
    public function getMaxBatchLimit()
    {
        // Not used by Mandrill API
        return 0;
    }

    /**
     * @param \Swift_Message $message
     * @param int            $toBeAdded
     * @param string         $type
     *
     * @return int
     */
    public function getBatchRecipientCount(\Swift_Message $message, $toBeAdded = 1, $type = 'to')
    {
        // Not used by Mandrill API
        return 0;
    }

    /**
     * Handle response
     *
     * @param Request       $request
     * @param MauticFactory $factory
     *
     * @return mixed
     */
    public function handleCallbackResponse(Request $request, MauticFactory $factory)
    {
        $mandrillEvents = $request->request->get('mandrill_events');
        $mandrillEvents = json_decode($mandrillEvents, true);
        $bounces        = array(
            'hashIds' => array(),
            'emails'  => array()
        );

        if (is_array($mandrillEvents)) {
            foreach ($mandrillEvents as $event) {
                if (in_array($event['event'], array('hard_bounce', 'soft_bounce', 'reject'))) {
                    if (!empty($event['msg']['diag'])) {
                        $reason = $event['msg']['diag'];
                    } elseif (!empty($event['msg']['bounce_description'])) {
                        $reason = $event['msg']['bounce_description'];
                    } else {
                        $reason = $event['event'];
                    }

                    if (isset($event['msg']['metadata']['hashId'])) {
                        $bounces['hashIds'][$event['msg']['metadata']['hashId']] = $reason;
                    } else {
                        $bounces['emails'][$event['msg']['email']] = $reason;
                    }
                }
            }
        }

        return array('bounces' => $bounces);
    }
}
