A whatsapp bot which can be interacted with by the user to get current total no of covid active
cases in a country (on today's date)

Includes a backend service, which polls COVID apis at regular intervals and stores country-wise active
cases number in mongodb database hosted in atlas cluster

Also includes a webservice, which exposes an endpoint which is hit when twilio whatsapp bot is hit with
a question

## Directions to Use:

Check the mongoDB database for updates every interval the job runs

Hit the twilio number on whatsapp and get your covid facts straight!
