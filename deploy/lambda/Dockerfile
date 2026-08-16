# Trade Alerts scheduled checker - AWS Lambda container image.
# Build context MUST be the repo root so the app modules are available:
#   docker build -f deploy/lambda/Dockerfile -t trade-alerts-lambda .
FROM public.ecr.aws/lambda/python:3.12

# Python deps (pandas/numpy are pulled in transitively by yfinance).
COPY deploy/lambda/requirements-lambda.txt ./
RUN pip install --no-cache-dir -r requirements-lambda.txt

# Application modules used by the handler.
COPY price_fetcher.py monitor.py monitor_v2.py notifier.py notifier_ses.py excel_manager.py db.py ./

# Lambda handler.
COPY deploy/lambda/lambda_function.py ./

# module.function
CMD ["lambda_function.handler"]
