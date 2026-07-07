# slf4j-api is pulled in transitively and references a logging binding that isn't
# on the runtime classpath; with no binding slf4j no-ops. Safe to ignore — this
# is exactly the rule R8 generates in missing_rules.txt.
-dontwarn org.slf4j.impl.StaticLoggerBinder
-dontwarn org.slf4j.**
