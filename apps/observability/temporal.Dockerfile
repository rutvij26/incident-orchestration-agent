FROM temporalio/auto-setup:1.25.2

USER root
RUN apk add --no-cache postgresql-client
USER temporal
