# Trade Alerts web dashboard API - AWS Lambda container image (Flask via apig-wsgi).
# Build context MUST be the repo root:
#   docker build -f deploy/lambda-web/Dockerfile -t trade-alerts-web .
FROM public.ecr.aws/lambda/python:3.12

COPY deploy/lambda-web/requirements-web.txt ./
RUN pip install --no-cache-dir -r requirements-web.txt

# Flask app + supporting modules.
COPY app.py price_fetcher.py monitor.py notifier.py excel_manager.py ./
COPY templates ./templates

# Lambda entrypoint (wraps app.py).
COPY deploy/lambda-web/lambda_web.py ./

CMD ["lambda_web.handler"]
